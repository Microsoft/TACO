﻿/// <reference path="typings/node.d.ts" />
/// <reference path="typings/Q.d.ts" />
/// <reference path="typings/gulp.d.ts" />
/// <reference path="typings/gulpExtensions.d.ts" />
/// <reference path="typings/nopt.d.ts" />
/// <reference path="typings/gulp-typescript.d.ts" />
/// <reference path="typings/gulp-sourcemaps.d.ts" />
/// <reference path="typings/run-sequence.d.ts" />
/// <reference path="typings/buildConfig.d.ts" />

import runSequence = require ("run-sequence");
import gulp = require ("gulp");
import sourcemaps = require ("gulp-sourcemaps");
import ts = require ("gulp-typescript");
import nopt = require ("nopt");
import path = require ("path");
import Q = require ("q");

import gulpUtils = require ("../tools/GulpUtils");

/* tslint:disable:no-console */
// Disable console rule for gulp file, since this is a build file
// we don't want to take dependency on Logger here

/* tslint:disable:no-var-requires */
// var require needed to require build_config.json
var buildConfig: BuildConfig.IBuildConfig = require("../../src/build_config.json");
/* tslint:enable:no-var-requires */
var tacoModules: string[] = ["taco-utils", "taco-kits", "taco-dependency-installer", "taco-cli", "remotebuild", "taco-remote", "taco-remote-lib"];
var allModules: string[] = tacoModules.concat(["taco-remote-multiplexer"]);

// honour --moduleFilter flag.
// gulp --moduleFilter taco-cli will build/install/run tests only for taco-cli
var options: any = nopt({ moduleFilter: String, drop: String }, {}, process.argv);
if (options.moduleFilter && tacoModules.indexOf(options.moduleFilter) > -1) {
    tacoModules = [options.moduleFilter];
}

/* Default task for building /src folder into /bin */
gulp.task("default", ["install-build"]);

/* Compiles the typescript files in the project, for fast iterative use */
gulp.task("compile", function (): Q.Promise<any> {
    return gulpUtils.streamToPromise(gulp.src([buildConfig.src + "/**/*.ts", "!" + buildConfig.src + "/gulpmain.ts"])
        .pipe(sourcemaps.init())
        .pipe(ts(buildConfig.tsCompileOptions))
        .pipe(sourcemaps.write("."))
        .pipe(gulp.dest(buildConfig.buildPackages)));
});

/* compile + copy */
gulp.task("build", ["prepare-templates"], function (callback: gulp.TaskCallback): void {
    runSequence("compile", "copy", callback);
});

gulp.task("package", [], function (callback: gulp.TaskCallback): void {
    runSequence("build", "just-package", callback);
});

gulp.task("beta-package", ["build"], function(): Q.Promise<any> {
    return gulpUtils.preparePublishPackages(buildConfig.buildPackages, "beta")
        .then(function(): Q.Promise<any> {
            // npm pack each folder, put the tgz in the parent folder
            return gulpUtils.packageModules(buildConfig.buildPackages, allModules, options.drop || buildConfig.buildPackages, "beta");
        }).catch(function(err: any): any {
            console.error("Error packaging: " + err);
            throw err;
        });
});

gulp.task("release-package", ["build"], function(): Q.Promise<any> {
    return gulpUtils.preparePublishPackages(buildConfig.buildPackages, "")
        .then(function(): Q.Promise<any> {
            // npm pack each folder, put the tgz in the parent folder
            return gulpUtils.packageModules(buildConfig.buildPackages, allModules, options.drop || buildConfig.buildPackages, "release");
        }).catch(function(err: any): any {
            console.error("Error packaging: " + err);
            throw err;
        });
});

gulp.task("just-package", [], function(): Q.Promise<any> {
    return gulpUtils.prepareDevPackages(buildConfig.buildPackages, options.drop, true)
        .then(function(): Q.Promise<any> {
            // npm pack each folder, put the tgz in the parent folder
            return gulpUtils.packageModules(buildConfig.buildPackages, allModules, options.drop || buildConfig.buildPackages);
        }).catch(function(err: any): any {
            console.error("Error packaging: " + err);
            throw err;
        });
});

/* full clean build */
gulp.task("rebuild", function (callback: gulp.TaskCallback): void {
    runSequence("clean", "build", callback);
});

/* Task to install the compiled modules */
gulp.task("install-build", ["package"], function (): Q.Promise<any> {
    return gulpUtils.installModules(tacoModules, buildConfig.buildPackages);
});

/* Cleans up the build location, will have to call "gulp prep" again */
gulp.task("clean", function (): Q.Promise<any> {
    return gulpUtils.uninstallModules(tacoModules, buildConfig.buildPackages);
});

/* Cleans up only the templates in the build folder */
gulp.task("clean-templates", function (callback: (err: Error) => void): void {
    gulpUtils.deleteDirectoryRecursive(path.resolve(buildConfig.buildTemplates), callback);
});

/* copy package.json and resources.json files from source to bin */
gulp.task("copy", function (): Q.Promise<any> {
    // Note: order matters, and later inclusions/exclusions take precedence over earlier ones.
    var filesToCopy: string[] = [
        "/**",
        "!/typings/**",
        "!/**/*.ts",
        "/*/.npmignore",
        "/**/templates/**",
        "/**/examples/**",
        "!/**/dynamicDependencies.json"
    ].map((val: string): string => val[0] === "!" ? "!" + path.join(buildConfig.src, val.substring(1)) : path.join(buildConfig.src, val));

    return Q.all([
        gulpUtils.copyFiles(filesToCopy, buildConfig.buildPackages),
        gulpUtils.copyDynamicDependenciesJson("/**/dynamicDependencies.json", buildConfig.src, buildConfig.buildPackages, options.drop && path.join(options.drop, "node_modules"))
    ]);
});

/* Task to run typescript linter on source code (excluding typings) */
gulp.task("tslint", function(): Q.Promise<any> {
    var tslint: any = require("gulp-tslint");
    return gulpUtils.streamToPromise(
        gulp.src([buildConfig.src + "/**/*.ts",
            "!" + buildConfig.src + "/typings/**"])
        .pipe(tslint())
        .pipe(tslint.report("verbose")));
});

/* Task to run tests */
gulp.task("run-tests", ["install-build", "tslint"], function (): Q.Promise<any> {
    return gulpUtils.runAllTests(tacoModules, buildConfig.buildPackages);
});

/* Task to archive template folders */
gulp.task("prepare-templates", ["clean-templates"], function (): Q.Promise<any> {
    return gulpUtils.prepareTemplates(buildConfig.templates, buildConfig.buildTemplates);
});
/* tslint:enable:no-console */

module.exports = gulp;
