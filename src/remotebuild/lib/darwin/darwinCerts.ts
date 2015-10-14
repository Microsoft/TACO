﻿/**
﻿ *******************************************************
﻿ *                                                     *
﻿ *   Copyright (C) Microsoft. All rights reserved.     *
﻿ *                                                     *
﻿ *******************************************************
﻿ */

/// <reference path="../../../typings/node.d.ts" />
/// <reference path="../../../typings/Q.d.ts" />
/// <reference path="../../../typings/node.d.ts" />
/// <reference path="../../../typings/rimraf.d.ts" />
/// <reference path="../../../typings/certOptions.d.ts" />

"use strict";

import child_process = require ("child_process");
import fs = require ("fs");
import os = require ("os");
import path = require ("path");
import Q = require ("q");
import readline = require ("readline");
import rimraf = require ("rimraf");
import util = require ("util");

import HostSpecifics = require ("../hostSpecifics");
import resources = require ("../../resources/resourceManager");
import RemoteBuildConf = require ("../remoteBuildConf");
import tacoUtils = require ("taco-utils");

import utils = tacoUtils.UtilHelper;
import logger = tacoUtils.Logger;

class Certs {
    private static debug: boolean = false;
    private static CERT_DEFAULTS: Certs.ICertOptions = {
        days: 1825, // 5 years
        country: "US",
        ca_cn: os.hostname().substring(0, 50) + ".RB.CA", // Note: these cn entries have a maximum length of 64 bytes. If a hostname contains unicode characters, then os.hostname will return an ascii mis-encoding which is still one byte per character.
        pfx_name: os.hostname().substring(0, 50) + ".RB.CC",
        client_cn: os.hostname().substring(0, 50) + ".RB" // Note: we need the client cert name to be a prefix of the CA cert so both are retrieved in the client. Otherwise it complains about self signed certificates
    };

    private static certStore: HostSpecifics.ICertStore = null;

    public static resetServerCert(conf: RemoteBuildConf, yesOrNoHandler?: Certs.ICliHandler): Q.Promise<any> {
        var certsDir: string = path.join(conf.serverDir, "certs");

        if (!fs.existsSync(certsDir)) {
            return Certs.initializeServerCerts(conf);
        }

        var shouldProceedDeferred: Q.Deferred<any> = Q.defer();
        yesOrNoHandler = yesOrNoHandler || readline.createInterface({ input: process.stdin, output: process.stdout });
        var answerCallback: (answer: string) => void = function (answer: string): void {
            answer = answer.toLowerCase();
            if (resources.getString("OSXResetServerCertResponseYes").split("\n").indexOf(answer) !== -1) {
                yesOrNoHandler.close();
                shouldProceedDeferred.resolve(true);
            } else if (resources.getString("OSXResetServerCertResponseNo").split("\n").indexOf(answer) !== -1) {
                yesOrNoHandler.close();
                shouldProceedDeferred.resolve(false);
            } else {
                yesOrNoHandler.question(resources.getString("OSXResetServerCertPleaseYesNo") + os.EOL, answerCallback);
            }
        };
        yesOrNoHandler.question(resources.getString("OSXResetServerCertQuery") + os.EOL, answerCallback);
        return shouldProceedDeferred.promise.
            then(function (shouldProceed: boolean): Q.Promise<any> {
                if (shouldProceed) {
                    rimraf.sync(certsDir);
                    return Certs.initializeServerCerts(conf)
                        .then((result: HostSpecifics.ICertStore): HostSpecifics.ICertStore => {
                            logger.log(resources.getString("OSXNoteAfterResetServerCert"));
                            return result;
                        });
                }

                return Q({});
            });
    }

    public static generateClientCert(conf: RemoteBuildConf): Q.Promise<number> {
        var certsDir: string = path.join(conf.serverDir, "certs");
        var caKeyPath: string = path.join(certsDir, "ca-key.pem");
        var caCertPath: string = path.join(certsDir, "ca-cert.pem");
        if (!fs.existsSync(caKeyPath) || !fs.existsSync(caCertPath)) {
            var error: string = resources.getString("CAFilesNotFound", caKeyPath, caCertPath);
            return Q(0).thenReject(error);
        }

        return Certs.makeClientPinAndSslCert(caKeyPath, caCertPath, certsDir, Certs.certOptionsFromConf(conf), conf).
            then(function (pin: number): number {
                if (tacoUtils.ArgsHelper.argToBool(conf.get("suppressSetupMessage"))) {
                    return pin;
                }

                Certs.printSetupInstructionsToConsole(conf, pin);
                return pin;
            });
    }

    public static initializeServerCerts(conf: RemoteBuildConf): Q.Promise<HostSpecifics.ICertStore> {
        var certsDir: string = path.join(conf.serverDir, "certs");
        var certPaths: Certs.ICertPaths = {
            certsDir: certsDir,
            caKeyPath: path.join(certsDir, "ca-key.pem"),
            caCertPath: path.join(certsDir, "ca-cert.pem"),
            serverKeyPath: path.join(certsDir, "server-key.pem"),
            serverCertPath: path.join(certsDir, "server-cert.pem"),
            newCerts: false
        };

        var certsExist: boolean = fs.existsSync(certPaths.caCertPath) && fs.existsSync(certPaths.serverKeyPath) && fs.existsSync(certPaths.serverCertPath);
        certPaths.newCerts = !certsExist;
        var promise: Q.Promise<any>;
        if (certsExist) {
            promise = Certs.isExpired(certPaths.caCertPath).
                then(function (hasExpired: boolean): Q.Promise<boolean> {
                    if (hasExpired) {
                        return Q(true);
                    }

                    return Certs.isExpired(certPaths.serverCertPath);
                });
        } else {
            promise = Q(true); // do not exist, so true -> need making
        }

        promise = promise.then(function (shouldMake: boolean): Q.Promise<any> {
            if (!shouldMake) {
                return Q({});
            }

            utils.createDirectoryIfNecessary(certsDir);
            fs.chmodSync(certsDir, 448); // 0700, user read/write/executable, no other permissions
            var options: Certs.ICertOptions = Certs.certOptionsFromConf(conf);
            return Certs.makeSelfSigningCACert(certPaths.caKeyPath, certPaths.caCertPath, options).
                then(function (): Q.Promise<void> {
                return Certs.makeSelfSignedCert(certPaths.caKeyPath, certPaths.caCertPath, certPaths.serverKeyPath, certPaths.serverCertPath, options, conf);
                }).
                then(function (): void {
                    certPaths.newCerts = true;
                });
        }).then(function (): HostSpecifics.ICertStore {
            Certs.certStore = {
                newCerts: certPaths.newCerts,
                getKey: function (): Buffer { return fs.readFileSync(certPaths.serverKeyPath); },
                getCert: function (): Buffer { return fs.readFileSync(certPaths.serverCertPath); },
                getCA: function (): Buffer { return fs.readFileSync(certPaths.caCertPath); }
            };
            return Certs.certStore;
            });
        return promise;
    }

    public static getServerCerts(): Q.Promise<HostSpecifics.ICertStore> {
        if (Certs.certStore) {
            return Q(Certs.certStore);
        } else {
            return Q.reject<HostSpecifics.ICertStore>(new Error(resources.getString("CertificatesNotConfigured")));
        }
    }

    public static isExpired(certPath: string): Q.Promise<boolean> {
        return Certs.displayCert(certPath, ["dates"]).
            then(function (output: { stdout: string; stderr: string }): boolean {
                var notAfter: Date = new Date(output.stdout.substring(output.stdout.indexOf("notAfter=") + 9, output.stdout.length - 1));
                return (notAfter.getTime() < new Date().getTime());
            });
    }

    // display fields an array of any of these: 'subject', 'issuer', 'dates', etc. (see https://www.openssl.org/docs/apps/x509.html)
    public static displayCert(certPath: string, displayFields: string[]): Q.Promise<{ stdout: string; stderr: string }> {
        // openssl x509 -noout -in selfsigned-cert.pem -subject -issuer -dates
        var args: string = "x509 -noout -in " + certPath;
        (displayFields || []).forEach(function (f: string): void {
            args += " -" + f;
        });
        return Certs.openSslPromise(args);
    }

    public static removeAllCertsSync(conf: RemoteBuildConf): void {
        var certsDir: string = path.join(conf.serverDir, "certs");
        if (fs.existsSync(certsDir)) {
            rimraf.sync(certsDir);
        }
    }

    public static downloadClientCerts(conf: RemoteBuildConf, pinString: string): string {
        Certs.purgeExpiredPinBasedClientCertsSync(conf);
        var clientCertsDir: string = path.join(conf.serverDir, "certs", "client");

        var pin: number = parseInt(pinString, 10);
        if (isNaN(pin)) {
            throw { code: 400, id: "InvalidPin" };
        }

        var pinDir: string = path.join(clientCertsDir, "" + pin);
        var pfx: string = path.join(pinDir, "client.pfx");
        if (!fs.existsSync(pfx)) {
            throw { code: 404, id: "ClientCertNotFoundForPIN" };
        }

        return pfx;
    }

    public static invalidatePIN(conf: RemoteBuildConf, pinString: string): void {
        var pinDir: string = path.join(conf.serverDir, "certs", "client", "" + parseInt(pinString, 10));
        rimraf(pinDir, utils.emptyMethod);
    }

    public static purgeExpiredPinBasedClientCertsSync(conf: RemoteBuildConf): void {
        var clientCertsDir: string = path.join(conf.serverDir, "certs", "client");
        if (!fs.existsSync(clientCertsDir)) {
            return;
        }

        var pinTimeoutInMinutes: number = conf.pinTimeout;
        var expiredIfOlderThan: number = new Date().getTime() - (pinTimeoutInMinutes * 60 * 1000);
        fs.readdirSync(clientCertsDir).forEach(function (f: string): void {
            var pfx: string = path.join(clientCertsDir, f, "client.pfx");
            if (fs.existsSync(pfx) && fs.statSync(pfx).mtime.getTime() < expiredIfOlderThan) {
                rimraf.sync(path.join(clientCertsDir, f));
            }
        });
    }

    // Makes a CA cert that will be used for self-signing our server and client certs.
    // Exported for tests
    public static makeSelfSigningCACert(caKeyPath: string, caCertPath: string, options?: Certs.ICertOptions): Q.Promise<{ stdout: string; stderr: string }> {
        options = options || <Certs.ICertOptions> {};
        var days: number = options.days || Certs.CERT_DEFAULTS.days;
        var country: string = options.country || Certs.CERT_DEFAULTS.country;
        var cn: string = Certs.CERT_DEFAULTS.ca_cn;
        return Certs.openSslPromise("req -newkey rsa:4096 -x509 -days " + days + " -nodes -subj /C=" + country + "/CN=" + cn + " -keyout " + caKeyPath + " -out " + caCertPath);
    }

    // Makes a new private key and certificate signed with the CA.
    // Exported for tests
    public static makeSelfSignedCert(caKeyPath: string, caCertPath: string, outKeyPath: string, outCertPath: string, options: Certs.ICertOptions, conf: RemoteBuildConf): Q.Promise<void> {
        options = options || <Certs.ICertOptions> {};
        var csrPath: string = path.join(path.dirname(outCertPath), "CSR-" + path.basename(outCertPath));
        var days: number = options.days || Certs.CERT_DEFAULTS.days;
        var cn: string = options.cn || Certs.CERT_DEFAULTS.client_cn;

        var cnfPath: string = path.join(conf.serverDir, "certs", "openssl.cnf");
        Certs.writeConfigFile(cnfPath, conf);

        return Certs.openSslPromise("genrsa -out " + outKeyPath + " 2048").
            then(function (): Q.Promise<{}> {
            return Certs.openSslPromise("req -new -subj /CN=" + cn + " -key " + outKeyPath + " -out " + csrPath + " -config " + cnfPath);
        }).
            then(function (): Q.Promise<{}> {
            return Certs.openSslPromise("x509 -req -days " + days + " -in " + csrPath + " -CA " + caCertPath + " -CAkey " + caKeyPath +
                " -extensions v3_req -extfile " + cnfPath + " -set_serial 01 -out " + outCertPath);
        }).
            then(function (): void {
            fs.unlinkSync(csrPath);
        });
    }

    public static verifyCert(caCertPath: string, certPath: string): Q.Promise<{ stdout: string; stderr: string }> {
        return Certs.openSslPromise("verify -CAfile " + caCertPath + " " + certPath);
    }

    private static openSslPromise(args: string): Q.Promise<{ stdout: string; stderr: string }> {
        var deferred: Q.Deferred<{ stdout: string; stderr: string }> = Q.defer<{ stdout: string; stderr: string }>();

        child_process.exec("openssl " + args, function (error: Error, stdout: Buffer, stderr: Buffer): void {
            if (Certs.debug) {
                logger.log("exec openssl " + args);
                logger.log(util.format("stdout: %s", stdout));
                logger.log(util.format("stderr: %s", stderr));
            }

            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
            }
        });

        return deferred.promise;
    }

    private static certOptionsFromConf(conf: RemoteBuildConf): Certs.ICertOptions {
        var options: Certs.ICertOptions = <Certs.ICertOptions> {};
        if (conf.certExpirationDays < 1) {
            logger.log(resources.getString("CertExpirationInvalid", conf.certExpirationDays, Certs.CERT_DEFAULTS.days));
            options.days = Certs.CERT_DEFAULTS.days;
        } else {
            options.days = conf.certExpirationDays;
        }

        return options;
    }

    private static writeConfigFile(cnfPath: string, conf: RemoteBuildConf): void {
        var net: any = os.networkInterfaces();
        var cnf: string = "[req]\ndistinguished_name = req_distinguished_name\nreq_extensions = v3_req\n[req_distinguished_name]\nC_default = US\n[ v3_req ]\nbasicConstraints = CA:FALSE\nkeyUsage = nonRepudiation, digitalSignature, keyEncipherment\nsubjectAltName = @alt_names\n[alt_names]\n";
        var hostname: string = conf.hostname;
        cnf += util.format("DNS.1 = %s\n", hostname);

        var ipCount: number = 1;
        Object.keys(net).forEach(function(key: string): void{
            for (var i: number = 0; i < net[key].length; i++) {
                if (net[key][i].address && !net[key][i].internal) {
                    cnf += util.format("IP.%d = %s\n", ipCount, net[key][i].address);
                    ipCount++;
                }
            }
        });

        fs.writeFileSync(cnfPath, cnf);
    }

    private static makeClientPinAndSslCert(caKeyPath: string, caCertPath: string, certsDir: string, options: Certs.ICertOptions, conf: RemoteBuildConf): Q.Promise<number> {
        options = options || <Certs.ICertOptions> {};
        options.cn = Certs.CERT_DEFAULTS.client_cn;
        var clientCertsPath: string = path.join(certsDir, "client");
        utils.createDirectoryIfNecessary(clientCertsPath);
        // 6 digit random pin (Math.random excludes 1.0)
        var pin: number = 100000 + Math.floor(Math.random() * 900000);
        var pinDir: string = path.join(clientCertsPath, "" + pin);
        var pfxPath: string = path.join(pinDir, "client.pfx");
        var clientKeyPath: string  = path.join(pinDir, "client-key.pem");
        var clientCertPath: string = path.join(pinDir, "client-cert.pem");

        utils.createDirectoryIfNecessary(pinDir);
        return Certs.makeSelfSignedCert(caKeyPath, caCertPath, clientKeyPath, clientCertPath, options, conf).
            then(function (): Q.Promise<{}> {
            return Certs.makePfx(caCertPath, clientKeyPath, clientCertPath, pfxPath);
            }).
            then(function (): number {
                fs.unlinkSync(clientKeyPath);
                fs.unlinkSync(clientCertPath);
                return pin;
            });
    }

    private static makePfx(caCertPath: string, keyPath: string, certPath: string, outPfxPath: string, options?: Certs.ICertOptions): Q.Promise<{ stdout: string; stderr: string }> {
        options = options || <Certs.ICertOptions> {};
        var name: string = Certs.CERT_DEFAULTS.pfx_name;
        return Certs.openSslPromise("pkcs12 -export -in " + certPath + " -inkey " + keyPath + " -certfile " + caCertPath + " -out " + outPfxPath +
            " -name \'" + name + "\' -password pass:");
    }

    private static printSetupInstructionsToConsole(conf: RemoteBuildConf, pin: number): void {
        var host: string = conf.hostname;
        var port: number = conf.port;
        var pinTimeoutInMinutes: number = conf.pinTimeout;
        logger.log(resources.getString("OSXCertSetupInformation", host, port, pin));
        if (pinTimeoutInMinutes) {
            logger.log(resources.getString("OSXCertSetupPinTimeout", pinTimeoutInMinutes));
        } else {
            logger.log(resources.getString("OSXCertSetupNoPinTimeout"));
        }

        logger.log("remotebuild certificates generate");
        logger.log("");
    }
}

export = Certs;
