/**
 *******************************************************
 *                                                     *
 *   Copyright (C) Microsoft. All rights reserved.     *
 *                                                     *
 *******************************************************
 */

/// <reference path="../../typings/mocha.d.ts"/>
/// <reference path="../../typings/should.d.ts"/>
/// <reference path="../../typings/tacoUtils.d.ts"/>
/// <reference path="../../typings/tacoTestsUtils.d.ts"/>

"use strict";

/* tslint:disable:no-var-requires */
// var require needed for should module to work correctly
// Note not import: We don't want to refer to shouldModule, but we need the require to occur since it modifies the prototype of Object.
var shouldModule: any = require("should");
/* tslint:enable:no-var-requires */

/* tslint:disable:no-var-requires */
// Special case to allow using color package with index signature for style rules
var colors: any = require("colors/safe");
/* tslint:enable:no-var-requires */

import tacoUtils = require ("taco-utils");
import Help = require ("../cli/help");
import tacoTestsUtils = require ("taco-tests-utils");

import ICommandData = tacoUtils.Commands.ICommandData;
import CommandHelper = require ("./utils/commandHelper");
import ICommand = tacoUtils.Commands.ICommand;
import MemoryStream = tacoTestsUtils.MemoryStream;

describe("help for a command", function (): void {
    var help: ICommand = CommandHelper.getCommand("help");
    // because of function overloading assigning "(buffer: string, cb?: Function) => boolean" as the type for
    // stdoutWrite just doesn't work
    var stdoutWrite = process.stdout.write; // We save the original implementation, so we can restore it later
    var memoryStdout: MemoryStream;
    var previous: boolean;

    function helpRun(command: string): Q.Promise<any> {
        var data: ICommandData = {
            options: {},
            original: [command],
            remain: [command]
        };

        return help.run(data);
    }

    function testHelpForCommand(command: string, expectedLines: string[], done: MochaDone): void {
        helpRun(command).done(() => {
            var expected: string = expectedLines.join("\n");
            var actual: string = colors.strip(memoryStdout.contentsAsText()); // The colors add extra characters
            actual = actual.replace(/ (\.+) ?\n  +/gm, " $1 "); // We undo the word-wrapping
            actual = actual.replace(/ +$/gm, ""); // Remove useless spaces at the end of a line
            actual.should.be.equal(expected);
            done();
        }, done);
    }

    before(() => {
        previous = process.env["TACO_UNIT_TEST"];
        process.env["TACO_UNIT_TEST"] = true;
    });

    after(() => {
        // We just need to reset the stdout just once, after all the tests have finished
        process.stdout.write = stdoutWrite;
        process.env["TACO_UNIT_TEST"] = previous;
    });

    beforeEach(() => {
        memoryStdout = new MemoryStream; // Each individual test gets a new and empty console
        process.stdout.write = memoryStdout.writeAsFunction(); // We'll be printing into an "in-memory" console, so we can test the output
    });

    it("prints the help for create", function (done: MochaDone): void {
        testHelpForCommand("create", [
            "",
            "CommandCreateDescription",
            "",
            "   taco create <PATH> [ID [NAME [CONFIG]]] [--OPTIONS]",
            "",
            "CommandHelpUsageParameters",
            "   PATH ............................ CommandCreateArgsPath",
            "   ID .............................. CommandCreateArgsId",
            "   NAME ............................ CommandCreateArgsName",
            "   CONFIG .......................... CommandCreateArgsConfig",
            "CommandHelpUsageOptions",
            "      --kit [NAME] ................. CommandCreateOptionsKit",
            "      --template <NAME|GIT-URL> .... CommandCreateOptionsTemplate",
            "      --cordova <VERSION> .......... CommandCreateOptionsCordova",
            "      --copy-from|src <PATH> ....... CommandCreateOptionsCopy",
            "      --link-to <PATH> ............. CommandCreateOptionsLinkto",
            ""], done);
    });

    it("prints the help for templates", function (done: MochaDone): void {
        testHelpForCommand("templates", [
            "",
            "CommandTemplatesDescription",
            "",
            "   taco templates",
            "",
            ""], done);
    });

    it("prints the help for templates using the template alias", function (done: MochaDone): void {
        testHelpForCommand("template", [
            "",
            "CommandTemplatesDescription",
            "",
            "   taco templates",
            "",
            ""], done);
    });

    it("prints the help for remote", function (done: MochaDone): void {
        testHelpForCommand("remote", [
            "",
            "CommandRemoteDescription",
            "",
            "   taco remote COMMAND",
            "",
            "CommandHelpUsageParameters",
            "   COMMAND .............. CommandRemoteSubcommandDescription",
            "   add <PLATFORM> ....... CommandRemoteAddSubcommandDescription",
            "   remove <PLATFORM> .... CommandRemoteRemoveSubcommandDescription",
            "   list ................. CommandRemoteListSubcommandDescription",
            "CommandHelpUsageAliases",
            "   rm -> remove",
            "   ls -> list",
            ""], done);
    });

    it("prints the help for platform", function (done: MochaDone): void {
        testHelpForCommand("platform", [
            "",
            "CommandPlatformDescription",
            "",
            "   taco platform [COMMAND] [--OPTIONS]",
            "",
            "CommandHelpUsageParameters",
            "   add <PLAT-SPEC> ....... CommandPlatformAddSubcommandDescription",
            "        --usegit ......... CommandPlatformUsegitDescription",
            "        --save ........... CommandPlatformSaveAddDescription",
            "        --link ........... CommandPlatformLinkDescription",
            "   remove <PLATFORM> ..... CommandPlatformRemoveSubcommandDescription",
            "        --save ........... CommandPlatformSaveRemoveDescription",
            "   list .................. CommandPlatformListSubcommandDescription",
            "   update <PLAT-SPEC> .... CommandPlatformUpdateSubcommandDescription",
            "        --usegit ......... CommandPlatformUsegitDescription",
            "        --save ........... CommandPlatformSaveUpdateDescription",
            "   check ................. CommandPlatformCheckSubcommandDescription",
            "CommandHelpUsageAliases",
            "   rm -> remove",
            "   ls -> list",
            ""], done);
    });

    it("prints the help for platform using the platforms alias", function (done: MochaDone): void {
        testHelpForCommand("platforms", [
            "",
            "CommandPlatformDescription",
            "",
            "   taco platform [COMMAND] [--OPTIONS]",
            "",
            "CommandHelpUsageParameters",
            "   add <PLAT-SPEC> ....... CommandPlatformAddSubcommandDescription",
            "        --usegit ......... CommandPlatformUsegitDescription",
            "        --save ........... CommandPlatformSaveAddDescription",
            "        --link ........... CommandPlatformLinkDescription",
            "   remove <PLATFORM> ..... CommandPlatformRemoveSubcommandDescription",
            "        --save ........... CommandPlatformSaveRemoveDescription",
            "   list .................. CommandPlatformListSubcommandDescription",
            "   update <PLAT-SPEC> .... CommandPlatformUpdateSubcommandDescription",
            "        --usegit ......... CommandPlatformUsegitDescription",
            "        --save ........... CommandPlatformSaveUpdateDescription",
            "   check ................. CommandPlatformCheckSubcommandDescription",
            "CommandHelpUsageAliases",
            "   rm -> remove",
            "   ls -> list",
            ""], done);
    });

    it("prints the help for plugin", function (done: MochaDone): void {
        testHelpForCommand("plugin", [
            "",
            "CommandPluginDescription",
            "",
            "   taco plugin [COMMAND] [--OPTIONS]",
            "",
            "CommandHelpUsageParameters",
            "   add <PLAT-SPEC> .................... CommandPluginAddSubcommandDescription",
            "        [--searchpath <DIRECTORY>] .... CommandPluginSearchPathDescription",
            "        [--noregistry] ................ CommandPluginNoRegistryDescription",
            "        [--link] ...................... CommandPluginLinkDescription",
            "        [--save] ...................... CommandPluginSaveAddDescription",
            "        [--shrinkwrap] ................ CommandPluginShrinkwrapDescription",
            "   remove <PLUGINID> [...] ............ CommandPluginRemoveSubcommandDescription",
            "        [--save] ...................... CommandPluginSaveRemoveDescription",
            "   list ............................... CommandPluginListSubcommandDescription",
            "   search ............................. CommandPluginSearchSubcommandDescription",
            "CommandHelpUsageAliases",
            "   rm -> remove",
            "   ls -> list",
            ""], done);
    });

    it("prints the help for plugin using the plugins alias", function (done: MochaDone): void {
        testHelpForCommand("plugins", [
            "",
            "CommandPluginDescription",
            "",
            "   taco plugin [COMMAND] [--OPTIONS]",
            "",
            "CommandHelpUsageParameters",
            "   add <PLAT-SPEC> .................... CommandPluginAddSubcommandDescription",
            "        [--searchpath <DIRECTORY>] .... CommandPluginSearchPathDescription",
            "        [--noregistry] ................ CommandPluginNoRegistryDescription",
            "        [--link] ...................... CommandPluginLinkDescription",
            "        [--save] ...................... CommandPluginSaveAddDescription",
            "        [--shrinkwrap] ................ CommandPluginShrinkwrapDescription",
            "   remove <PLUGINID> [...] ............ CommandPluginRemoveSubcommandDescription",
            "        [--save] ...................... CommandPluginSaveRemoveDescription",
            "   list ............................... CommandPluginListSubcommandDescription",
            "   search ............................. CommandPluginSearchSubcommandDescription",
            "CommandHelpUsageAliases",
            "   rm -> remove",
            "   ls -> list",
            ""], done);
    });

    it("prints the help for kit", function (done: MochaDone): void {
        testHelpForCommand("kit", [
            "",
            "CommandKitDescription",
            "",
            "   taco kit [COMMAND] [--OPTIONS]",
            "",
            "CommandHelpUsageParameters",
            "   list ........................ CommandKitListSubcommandDescription",
            "        --json <PATH> .......... CommandKitJsonOptionDescription",
            "        --kit <KIT-ID> ......... CommandKitOptionKitDescription",
            "   select ...................... CommandKitSelectSubcommandDescription",
            "        --kit <KIT-ID> ......... CommandKitSelectOptionKitDescription",
            "        --cordova <VERSION> .... CommandKitSelectOptionCordovaDescription",
            "CommandHelpUsageExamples",
            "   * TacoKitListExample",
            "",
            "        taco kit list --kit tacokit@2.0.0",
            "",
            "   * TacoKitSelectExample1",
            "",
            "        taco kit select --kit tacokit@2.0.0",
            "",
            "   * TacoKitSelectExample2",
            "",
            "        taco kit select --cordova 5.2.0",
            "",
            "CommandHelpUsageNotes",
            "   * TacoKitNotes",
            "",
            ""], done);
    });

    it("prints the help for build", function (done: MochaDone): void {
        testHelpForCommand("build", [
            "",
            "CommandBuildDescription",
            "",
            "   taco build [PLATFORM] [--OPTIONS]",
            "",
            "CommandHelpUsageParameters",
            "   PLATFORM .............. CommandBuildPlatformDescription",
            "CommandHelpUsageOptions",
            "      --remote ........... CommandBuildRemoteDescription",
            "      --local ............ CommandBuildLocalDescription",
            "      --clean ............ CommandBuildCleanDescription",
            "      --debug ............ CommandBuildDebugDescription",
            "      --release .......... CommandBuildReleaseDescription",
            "      --device ........... CommandBuildDeviceDescription",
            "      --emulator ......... CommandBuildEmulatorDescription",
            "      --target=TARGET .... CommandBuildTargetDescription",
            ""], done);
    });

    it("prints the help for run", function (done: MochaDone): void {
        testHelpForCommand("run", [
            "",
            "CommandRunDescription",
            "",
            "   taco run [PLATFORM] [--OPTIONS]",
            "",
            "CommandHelpUsageParameters",
            "   PLATFORM .............. CommandRunPlatformDescription",
            "CommandHelpUsageOptions",
            "      --remote ........... CommandRunRemoteDescription",
            "      --local ............ CommandRunLocalDescription",
            "      --nobuild .......... CommandRunNobuildDescription",
            "      --debuginfo ........ CommandRunDebuginfoDescription",
            "      --debug ............ CommandRunDebugDescription",
            "      --release .......... CommandRunReleaseDescription",
            "      --device ........... CommandRunDeviceDescription",
            "      --emulator ......... CommandRunEmulatorDescription",
            "      --target=TARGET .... CommandRunTargetDescription",
            ""], done);
    });

    it("prints the help for install-reqs", function (done: MochaDone): void {
        testHelpForCommand("install-reqs", [
            "",
            "CommandInstallReqsDescription",
            "",
            "   taco install-reqs [PLATFORM]",
            "",
            "CommandHelpUsageParameters",
            "   [PLATFORM] .......... CommandInstallReqsPlatformDescription",
            ""], done);
    });

    it("prints the help for emulate", function (done: MochaDone): void {
        testHelpForCommand("emulate", [
            "",
            "CommandEmulateDescription",
            "",
            "   taco emulate [PLATFORM] [--OPTIONS]",
            "",
            "CommandHelpUsageParameters",
            "   PLATFORM ............ CommandRunPlatformDescription",
            "   --remote ............ CommandRunRemoteDescription",
            "   --local ............. CommandRunLocalDescription",
            "   --nobuild ........... CommandRunNobuildDescription",
            "   --debuginfo ......... CommandRunDebuginfoDescription",
            "   --debug ............. CommandRunDebugDescription",
            "   --release ........... CommandRunReleaseDescription",
            "   --target=TARGET ..... CommandRunTargetDescription",
            ""], done);
    });
});
