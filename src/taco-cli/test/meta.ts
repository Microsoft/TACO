﻿/**
﻿ * ******************************************************
﻿ *                                                       *
﻿ *   Copyright (C) Microsoft. All rights reserved.       *
﻿ *                                                       *
﻿ *******************************************************
﻿ */
/// <reference path="../../typings/should.d.ts"/>
/// <reference path="../../typings/mocha.d.ts"/>
/// <reference path="../../typings/tacoUtils.d.ts"/>

"use strict";

import fs = require ("fs");
import mocha = require ("mocha");
import path = require ("path");
import Q = require ("q");
import should = require ("should");
import util = require ("util");

import resources = require ("../resources/resourceManager");
import Taco = require ("../cli/taco");
import TacoErrorCodes = require ("../cli/tacoErrorCodes");
import tacoUtils = require ("taco-utils");
import Version = require ("../cli/version");

import Commands = tacoUtils.Commands;
import utils = tacoUtils.UtilHelper;

import CommandHelper = require ("./utils/commandHelper");
import ICommand = tacoUtils.Commands.ICommand;
import TacoUtilsErrorCodes = tacoUtils.TacoErrorCode;

interface ICommandOptionsAndArgsInfo {
    name: string;
    description: string;
}

interface ICommandInfo {
    [commandName: string]: {
        synopsis: string;
        modulePath: string;
        description: string;
        args?: ICommandOptionsAndArgsInfo;
        options?: ICommandOptionsAndArgsInfo;
    };
}

    // Command list
    var commandsJsonPath: string = path.resolve(__dirname, "..", "cli", "commands.json");
    fs.existsSync(commandsJsonPath).should.be.true;

    var commands: any = require(commandsJsonPath);
    should(commands).not.be.empty;

    // Options we are interested in testing
    var tacoValidArgs: string[][] = [[], ["-v"], ["--help"], ["-----help"]];
    var tacoInvalidArgs: string[][] = [["/?"], ["?"]];

    function runHelp(command: string): Q.Promise<any> {
        var help: ICommand = CommandHelper.getCommand("help");
        return help.run([command]);
    };

    function runVersion(): Q.Promise<any> {
        var version: Version = new Version();
        return version.run([]);
    };

describe("taco meta command tests: ", function (): void {

    // Run help for a cordova command not overriden by taco - ex, "info"
   it("taco help info executes with no error", function (done: MochaDone): void {
            runHelp("info").then(function (): void {
                done();
            }, function (err: tacoUtils.TacoError): void {
                done(err);
            });
    });

    // Run taco command with valid and invalid options
    describe("taco command", function (): void {
        tacoValidArgs.forEach(function (optionString: string[]): void {
            it("with options " + optionString + " executes with no error", function (done: MochaDone): void {
                this.timeout(10000);
                Taco.runWithArgs(optionString).then(function (): void {
                    done();
                }, function (err: tacoUtils.TacoError): void {
                   done(err);
                });
            });
        });

        tacoInvalidArgs.forEach(function (optionString: string[]): void {
            it("with invalid options " + optionString + " executes with expected error", function (done: MochaDone): void {
                this.timeout(10000);
                Taco.runWithArgs(optionString).then(function (): void {
                    done(new Error("Passing Invalid options to \'taco\' should have failed"));
                }, function (err: any): void {
                    if (err.errorCode === TacoUtilsErrorCodes.CordovaCommandFailed) {
                        done();
                    } else {
                        done(new Error("Unexpected error code"));
                    }
                });
            });
        });
    });

    // Run taco version command
    it("taco version command should execute without an error", function (done: MochaDone): void {
            runVersion().then(function (): void {
                done();
            }, function (err: tacoUtils.TacoError): void {
                done(err);
            });
        });
});
