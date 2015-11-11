﻿/**
﻿ *******************************************************
﻿ *                                                     *
﻿ *   Copyright (C) Microsoft. All rights reserved.     *
﻿ *                                                     *
﻿ *******************************************************
﻿ */

/// <reference path="../../typings/tacoUtils.d.ts" />
/// <reference path="../../typings/node.d.ts" />
/// <reference path="../../typings/nopt.d.ts" />

"use strict";

import path = require("path");
import Q = require("q");

import buildTelemetryHelper = require("./utils/buildTelemetryHelper");
import RemoteBuildSettings = require("./remoteBuild/buildSettings");
import CordovaWrapper = require("./utils/cordovaWrapper");
import PlatformHelper = require("./utils/platformHelper");
import RemoteBuildClientHelper = require("./remoteBuild/remoteBuildClientHelper");
import resources = require("../resources/resourceManager");
import Settings = require("./utils/settings");
import TacoErrorCodes = require("./tacoErrorCodes");
import errorHelper = require("./tacoErrorHelper");
import tacoUtility = require("taco-utils");
import vsEmulator = require("./utils/vsEmulator");

import VSEmulator = vsEmulator.VSEmulator;
import EmulatorDetail = vsEmulator.EmulatorDetail;
import EmulatorProfile = vsEmulator.EmulatorProfile;
import BuildInfo = tacoUtility.BuildInfo;
import commands = tacoUtility.Commands;
import logger = tacoUtility.Logger;

import ICommandTelemetryProperties = tacoUtility.ICommandTelemetryProperties;

/**
 * Emulate
 *
 * handles "taco emulate"
 */
class Emulate extends commands.TacoCommandBase {
    private static KNOWN_OPTIONS: Nopt.CommandData = {
        local: Boolean,
        remote: Boolean,
        debuginfo: Boolean,
        nobuild: Boolean,

        device: Boolean,
        target: String,

        // Are these only for when we build as part of running?
        debug: Boolean,
        release: Boolean
    };
    private static SHORT_HANDS: Nopt.ShortFlags = {};

    public name: string = "run";
    public info: commands.ICommandInfo;

    private static generateTelemetryProperties(telemetryProperties: tacoUtility.ICommandTelemetryProperties,
        commandData: commands.ICommandData): Q.Promise<tacoUtility.ICommandTelemetryProperties> {
        return buildTelemetryHelper.addCommandLineBasedPropertiesForBuildAndRun(telemetryProperties, Emulate.KNOWN_OPTIONS, commandData);
    }

    private static runRemotePlatform(platform: string, commandData: commands.ICommandData,
        telemetryProperties: ICommandTelemetryProperties): Q.Promise<any> {
        return Q.all<any>([Settings.loadSettings(), CordovaWrapper.getCordovaVersion()]).spread<any>(function(settings: Settings.ISettings, cordovaVersion: string): Q.Promise<any> {
            var configuration: string = commandData.options["release"] ? "release" : "debug";
            var buildTarget: string = commandData.options["target"] || "";
            var language: string = settings.language || "en";
            var remoteConfig: Settings.IRemoteConnectionInfo = settings.remotePlatforms && settings.remotePlatforms[platform];
            if (!remoteConfig) {
                throw errorHelper.get(TacoErrorCodes.CommandRemotePlatformNotKnown, platform);
            }

            var buildInfoPath: string = path.resolve(".", "remote", platform, configuration, "buildInfo.json");
            var buildInfoPromise: Q.Promise<BuildInfo>;
            var buildSettings: RemoteBuildSettings = new RemoteBuildSettings({
                projectSourceDir: path.resolve("."),
                buildServerInfo: remoteConfig,
                buildCommand: "build",
                platform: platform,
                configuration: configuration,
                buildTarget: buildTarget,
                language: language,
                cordovaVersion: cordovaVersion
            });

            // Find the build that we are supposed to run
            if (commandData.options["nobuild"]) {
                buildInfoPromise = RemoteBuildClientHelper.checkForBuildOnServer(buildSettings, buildInfoPath).then(function(buildInfo: BuildInfo): BuildInfo {
                    if (!buildInfo) {
                        // No info for the remote build: User must build first
                        var buildCommandToRun: string = "taco build" + ([commandData.options["remote"] ? " --remote" : ""].concat(commandData.remain).join(" "));
                        throw errorHelper.get(TacoErrorCodes.NoRemoteBuildIdFound, buildCommandToRun);
                    } else {
                        return buildInfo;
                    }
                });
            } else {
                // Always do a rebuild, but incrementally if possible.
                buildInfoPromise = RemoteBuildClientHelper.build(buildSettings, telemetryProperties);
            }

            return buildInfoPromise.then(function(buildInfo: BuildInfo): Q.Promise<BuildInfo> {
                return RemoteBuildClientHelper.emulate(buildInfo, remoteConfig, buildTarget);
            }).then(function(buildInfo: BuildInfo): BuildInfo {
                logger.log(resources.getString("CommandRunRemoteEmulatorSuccess"));
                return buildInfo;
            }).then(function(buildInfo: BuildInfo): Q.Promise<BuildInfo> {
                if (commandData.options["debuginfo"]) {
                    // enable debugging and report connection information
                    return RemoteBuildClientHelper.debug(buildInfo, remoteConfig)
                        .then(function(debugBuildInfo: BuildInfo): BuildInfo {
                            if (debugBuildInfo["webDebugProxyPort"]) {
                                logger.log(JSON.stringify({ webDebugProxyPort: debugBuildInfo["webDebugProxyPort"] }));
                            }

                            return debugBuildInfo;
                        });
                } else {
                    return Q(buildInfo);
                }
            });
        });
    }

    private static emulate(commandData: commands.ICommandData): Q.Promise<tacoUtility.ICommandTelemetryProperties> {
        var telemetryProperties: ICommandTelemetryProperties = {};
        return Q.all<any>([PlatformHelper.determinePlatform(commandData), Settings.loadSettingsOrReturnEmpty()])
            .spread((platforms: PlatformHelper.IPlatformWithLocation[], settings: Settings.ISettings): Q.Promise<any> => {
                buildTelemetryHelper.storePlatforms(telemetryProperties, "actuallyBuilt", platforms, settings);

                return PlatformHelper.operateOnPlatforms(platforms,
                    (localPlatforms: string[]): Q.Promise<any> =>
                        Emulate.handleVsEmulator(commandData, localPlatforms)
                            .then((remainingLocalPlatforms) => {
                                if (remainingLocalPlatforms.length > 0) {
                                    /* if we have any unhandled local platforms */
                                    CordovaWrapper.emulate(commandData, remainingLocalPlatforms);
                                }
                            }),
                    (remotePlatform: string): Q.Promise<any> => Emulate.runRemotePlatform(remotePlatform, commandData, telemetryProperties)
                );
            }).then(() => Emulate.generateTelemetryProperties(telemetryProperties, commandData));
    }

    private static handleVsEmulator(commandData: commands.ICommandData, platforms: string[]): Q.Promise<string[]> {
        var deferred = Q.defer<string[]>();
        if (platforms && platforms.indexOf("android") > -1 && commandData && commandData.options && commandData.options["vsemulator"]) {
            VSEmulator.isReady()
                .then(isReady => {
                    if (isReady) {
                        return VSEmulator.getOrLaunchEmulator()
                            .then(emulator => {
                                return Emulate.emulateProfile(commandData, emulator);
                            })
                            .then(() => {
                                /* success, remove handled platform from array */
                                platforms.splice(platforms.indexOf("android"), 1);
                                deferred.resolve(platforms);
                            });
                    } else {
                        /* TODO - need input from PM: no VS emulator profiles installed. Display a message?  */
                        deferred.resolve(platforms);
                    }}).done();
        } else {
            /* no android platform or vs emulator not specified - nothing to do */
            deferred.resolve(platforms);
        }

        return deferred.promise;
    }

    /**
     * Calls the Cordova emulate command with the given data and emulator as a target.
     */
    private static emulateProfile(commandData: commands.ICommandData, profile: EmulatorDetail): Q.Promise<any> {
        commandData.options["target"] = profile.adbSerialNumber;
        return CordovaWrapper.emulate(commandData, ["android"]);
    }

    /* tslint:disable:member-ordering */
    // tslint doesn't handle this case and considers subcommands as member function
    public subcommands: commands.ICommand[] = [
        {
            name: "emulate",
            run: Emulate.emulate,
            canHandleArgs(commandData: commands.ICommandData): boolean {
                return true;
            }
        }
    ];
    /* tslint:enable:member-ordering */

    /**
     * specific handling for whether this command can handle the args given, otherwise falls through to Cordova CLI
     */
    public canHandleArgs(data: commands.ICommandData): boolean {
        return true;
    }

    public parseArgs(args: string[]): commands.ICommandData {
        var parsedOptions: commands.ICommandData = tacoUtility.ArgsHelper.parseArguments(Emulate.KNOWN_OPTIONS, Emulate.SHORT_HANDS, args, 0);

        // Raise errors for invalid command line parameters
        if (parsedOptions.options["remote"] && parsedOptions.options["local"]) {
            throw errorHelper.get(TacoErrorCodes.ErrorIncompatibleOptions, "--remote", "--local");
        }

        if (parsedOptions.options["device"]) {
            throw errorHelper.get(TacoErrorCodes.ErrorIncompatibleOptions, "--device", "--emulate");
        }

        if (parsedOptions.options["debug"] && parsedOptions.options["release"]) {
            throw errorHelper.get(TacoErrorCodes.ErrorIncompatibleOptions, "--debug", "--release");
        }

        return parsedOptions;
    }

}

export = Emulate;
