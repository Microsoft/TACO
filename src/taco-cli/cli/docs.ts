﻿/**
﻿ *******************************************************
﻿ *                                                     *
﻿ *   Copyright (C) Microsoft. All rights reserved.     *
﻿ *                                                     *
﻿ *******************************************************
﻿ */

/// <reference path="../../typings/tacoUtils.d.ts" />
/// <reference path="../../typings/opener.d.ts" />

"use strict";

import Q = require ("q");

import resources = require ("../resources/resourceManager");
import tacoUtility = require ("taco-utils");
import opener = require ("opener");

import commands = tacoUtility.Commands;

/**
 * Documentation
 *
 * Handles "taco Documentation"
 */
class Documentation extends commands.TacoCommandBase {
    public info: commands.ICommandInfo;

    protected runCommand(): Q.Promise<any> {
        // This implementation is based on "npm docs": https://github.com/npm/npm/blob/master/lib/docs.js
        var link: string = resources.getString("TacoDocumentationLink");
        opener(link);
        return Q.resolve({});
    }

    public parseArgs(args: string[]): commands.ICommandData {
        return { options: {}, original: [], remain: [] };
    }
}

export = Documentation;
