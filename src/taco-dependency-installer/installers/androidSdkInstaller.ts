﻿/**
﻿ *******************************************************
﻿ *                                                     *
﻿ *   Copyright (C) Microsoft. All rights reserved.     *
﻿ *                                                     *
﻿ *******************************************************
﻿ */

/// <reference path="../../typings/adm-zip.d.ts" />
/// <reference path="../../typings/dependencyInstallerInterfaces.d.ts" />
/// <reference path="../../typings/Q.d.ts" />
/// <reference path="../../typings/request.d.ts" />
/// <reference path="../../typings/wrench.d.ts" />

"use strict";

import admZip = require ("adm-zip");
import childProcess = require ("child_process");
import fs = require ("fs");
import os = require ("os");
import path = require ("path");
import Q = require ("q");
import request = require ("request");
import util = require ("util");
import wrench = require ("wrench");

import InstallerBase = require ("./installerBase");
import installerProtocol = require ("../elevatedInstallerProtocol");
import installerUtils = require ("../utils/installerUtils");
import installerUtilsWin32 = require ("../utils/win32/installerUtilsWin32");
import resources = require ("../resources/resourceManager");
import tacoUtils = require ("taco-utils");

import ILogger = installerProtocol.ILogger;
import utilHelper = tacoUtils.UtilHelper;

class AndroidSdkInstaller extends InstallerBase {
    private static AndroidHomeName: string = "ANDROID_HOME";
    private static AndroidCommand = os.platform() === "win32" ? "android.bat" : "android";
    private static AndroidPackages: string[] = [
        // "tools",  // Android SDK comes by default with the tools package, so there is no need to update it. In the future, if we feel we want dependency installer to always install the latest Tools package, then uncomment this.
        "platform-tools",
        "extra-android-support",
        "extra-android-m2repository",
        "build-tools-19.1.0",
        "build-tools-21.1.2",
        "build-tools-22.0.1",
        "android-19",
        "android-21",
        "android-22"
    ];

    private installerArchive: string;
    private androidHomeValue: string;

    constructor(installerInfo: DependencyInstallerInterfaces.IInstallerData, softwareVersion: string, installTo: string, logger: ILogger, steps: DependencyInstallerInterfaces.IStepsDeclaration) {
        super(installerInfo, softwareVersion, installTo, logger, steps, "androidSdk");
    }

    protected downloadWin32(): Q.Promise<any> {
        return this.downloadDefault();
    }

    protected installWin32(): Q.Promise<any> {
        return this.installDefault();
    }

    protected updateVariablesWin32(): Q.Promise<any> {
        // Initialize values
        var androidHomeValue: string = path.join(this.installDestination, "android-sdk-windows");
        var addToPathTools: string = path.join(androidHomeValue, "tools");
        var addToPathPlatformTools: string = path.join(androidHomeValue, "platform-tools");

        this.androidHomeValue = androidHomeValue;

        return installerUtilsWin32.setEnvironmentVariableIfNeededWin32(AndroidSdkInstaller.AndroidHomeName, androidHomeValue, this.logger)
            .then(function (): Q.Promise<any> {
                return installerUtilsWin32.addToPathIfNeededWin32([addToPathTools, addToPathPlatformTools]);
            });
    }

    protected postInstallWin32(): Q.Promise<any> {
        return this.postInstallDefault();
    }

    protected downloadDarwin(): Q.Promise<any> {
        return this.downloadDefault();
    }

    protected installDarwin(): Q.Promise<any> {
        var self = this;

        // Before we extract Android SDK, we need to save the first directory under the specified install path that doesn't exist. This directory and all those under it will be created
        // with root as the owner, so we will need to change the owner back to the current user after the extraction is complete.
        var pathSegments: string[] = path.resolve(this.installDestination).split(os.EOL);
        var firstNonExistentDir: string;
        var pathSoFar: string = "";

        pathSegments.some(function (dir: string): boolean {
            pathSoFar = path.join(pathSoFar, dir);

            if (!fs.existsSync(pathSoFar)) {
                firstNonExistentDir = pathSoFar;

                return true;
            }

            return false;
        });

        return this.installDefault()
            .then(function (): void {
                // If some segments of the path the SDK was extracted to didn't exist before, it means they were created as part of the install. They will have root as the owner, so we 
                // must change the owner back to the current user.
                if (firstNonExistentDir) {
                    wrench.chownSyncRecursive(firstNonExistentDir, parseInt(process.env.SUDO_UID), parseInt(process.env.SUDO_GID));
                }
            });
    }

    protected updateVariablesDarwin(): Q.Promise<any> {
        var deferred: Q.Deferred<any> = Q.defer<any>();

        // Initialize values
        var androidHomeValue: string = path.join(this.installDestination, "android-sdk-macosx");
        var addToPathTools: string = "$" + AndroidSdkInstaller.AndroidHomeName + "/tools/";
        var addToPathPlatformTools: string = "$" + AndroidSdkInstaller.AndroidHomeName + "/platform-tools/";
        var newPath: string = "\"$PATH:" + addToPathTools + ":" + addToPathPlatformTools + "\"";
        var appendToBashProfile: string = "\n# Android SDK\nexport ANDROID_HOME=" + androidHomeValue + "\nexport PATH=" + newPath;
        var bashProfilePath: string = path.join(process.env.HOME, ".bash_profile");
        var updateCommand: string = "echo '" + appendToBashProfile + "' >> '" + bashProfilePath + "'";
        var mustChown: boolean = !fs.existsSync(bashProfilePath);

        this.androidHomeValue = androidHomeValue;

        childProcess.exec(updateCommand, function (error: Error, stdout: Buffer, stderr: Buffer): void {
            if (error) {
                this.telemetry
                    .add("error.description", "ErrorOnChildProcess on updateVariablesDarwin", /*isPii*/ false)
                    .addError(error);
                deferred.reject(error);
            } else {
                // If .bash_profile didn't exist before, make sure the owner is the current user, not root
                if (mustChown) {
                    fs.chownSync(bashProfilePath, parseInt(process.env.SUDO_UID), parseInt(process.env.SUDO_GID));
                }

                deferred.resolve({});
            }
        });

        return deferred.promise;
    }

    protected postInstallDarwin(): Q.Promise<any> {
        var self = this;

        // We need to add execute permission to the android executable in order to run it
        return this.addExecutePermission(path.join(this.androidHomeValue, "tools", "android"))
            .then(function (): Q.Promise<any> {
                return self.postInstallDefault();
            })
            .then(function (): Q.Promise<any> {
                // We need to add execute permissions for the Gradle wrapper
                return self.addExecutePermission(path.join(self.androidHomeValue, "tools", "templates", "gradle", "wrapper", "gradlew"));
            });
    }

    private downloadDefault(): Q.Promise<any> {
        this.installerArchive = path.join(InstallerBase.InstallerCache, "androidSdk", os.platform(), this.softwareVersion, path.basename(this.installerInfo.installSource));

        // Prepare expected archive file properties
        var expectedProperties: installerUtils.IFileSignature = {
            bytes: this.installerInfo.bytes,
            sha1: this.installerInfo.sha1
        };

        // Prepare download options
        var options: request.Options = {
            uri: this.installerInfo.installSource,
            method: "GET",
        };

        // Download the archive
        return installerUtils.downloadFile(options, this.installerArchive, expectedProperties);
    }

    private installDefault(): Q.Promise<any> {
        // Make sure we have an install location
        if (!this.installDestination) {
            this.telemetry.add("error.description", "NeedInstallDestination on installDefault", /*isPii*/ false);
            return Q.reject(new Error(resources.getString("NeedInstallDestination")));
        }

        // Extract the archive
        var templateZip = new admZip(this.installerArchive);

        if (!fs.existsSync(this.installDestination)) {
            wrench.mkdirSyncRecursive(this.installDestination, 511); // 511 decimal is 0777 octal
        }

        templateZip.extractAllTo(this.installDestination);

        return Q.resolve({});
    }

    private addExecutePermission(fileFullPath: string): Q.Promise<any> {
        var deferred: Q.Deferred<any> = Q.defer<any>();
        var command: string = util.format("chmod a+x \"%s\"", fileFullPath);

        childProcess.exec(command, function (error: Error, stdout: Buffer, stderr: Buffer): void {
            if (error) {
                this.telemetry
                    .add("error.description", "ErrorOnChildProcess on addExecutePermission", /*isPii*/ false)
                    .addError(error);
                deferred.reject(error);
            } else {
                deferred.resolve({});
            }
        });

        return deferred.promise;
    }

    private killAdb(): Q.Promise<any> {
        // Kill stray adb processes - this is an important step
        // as stray adb processes spawned by the android installer
        // can result in a hang post installation
        var deferred: Q.Deferred<any> = Q.defer<any>();

        var adbProcess: childProcess.ChildProcess = childProcess.spawn(path.join(this.androidHomeValue, "platform-tools", "adb"), ["kill-server"]);
        adbProcess.on("error", function (error: Error): void {
            this.telemetry
                .add("error.description", "ErrorOnKillingAdb in killAdb", /*isPii*/ false)
                .addError(error);
            deferred.reject(error);
        });
            
        adbProcess.on("exit", function (code: number): void {
            deferred.resolve({});
        });

        return deferred.promise;
    }

    private installAndroidPackages(): Q.Promise<any> {
        // Install Android packages
        var deferred: Q.Deferred<any> = Q.defer<any>();
        var command = path.join(this.androidHomeValue, "tools", AndroidSdkInstaller.AndroidCommand);
        var args: string[] = [
            "update",
            "sdk",
            "-u",
            "-a",
            "--filter",
            AndroidSdkInstaller.AndroidPackages.join(",")
        ];
        var errorOutput: string = "";
        var cp: childProcess.ChildProcess = os.platform() === "darwin" ? childProcess.spawn(command, args, { uid: parseInt(process.env.SUDO_UID), gid: parseInt(process.env.SUDO_GID) }) : childProcess.spawn(command, args);

        cp.stdout.on("data", function (data: Buffer): void {
            var stringData = data.toString();

            if (/\[y\/n\]:/.test(stringData)) {
                // Accept license terms
                cp.stdin.write("y" + os.EOL);
                cp.stdin.end();
            }
        });
        cp.stderr.on("data", function (data: Buffer): void {
            errorOutput += data.toString();
        });
        cp.on("error", function (err: Error): void {
            this.telemetry
                .add("error.description", "ErrorOnChildProcess on postInstallDefault", /*isPii*/ false)
                .addError(err);
            deferred.reject(err);
        });
        cp.on("exit", function (code: number): void {
            if (errorOutput) {
                this.telemetry
                    .add("error.description", "ErrorOnExitOfChildProcess on postInstallDefault", /*isPii*/ false)
                    .add("error.code", code, /*isPii*/ false)
                    .add("error.message", errorOutput, /*isPii*/ true);
                deferred.reject(new Error(errorOutput));
            } else {
                deferred.resolve({});
            }
        });

        return deferred.promise;
    }

    private postInstallDefault(): Q.Promise<any> {
        var self = this;
        return this.installAndroidPackages()
        .then(function (): Q.Promise<any> {
            return self.killAdb();
        });
    }
}

export = AndroidSdkInstaller;
