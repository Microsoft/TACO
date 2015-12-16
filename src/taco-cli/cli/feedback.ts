﻿/**
﻿ *******************************************************
﻿ *                                                     *
﻿ *   Copyright (C) Microsoft. All rights reserved.     *
﻿ *                                                     *
﻿ *******************************************************
﻿ */

/// <reference path="../../typings/tacoUtils.d.ts" />

"use strict";
import Q = require ("q");
import tacoUtility = require ("taco-utils");

import commands = tacoUtility.Commands;
import telemetry = tacoUtility.Telemetry;

/**
 * feedback
 *
 * handles "taco feedback"
 */
class Feedback extends commands.TacoCommandBase {
    public info: commands.ICommandInfo;

    public name: string = "feedback";

    public parseArgs(args: string[]): commands.ICommandData {
        return { options: {}, original: [], remain: [] };
    }

    /**
     * Prompt for telemetry consent
     */
    protected runCommand(): Q.Promise<tacoUtility.ICommandTelemetryProperties> {
        return telemetry.changeTelemetryOptInSetting();
    }
}

export = Feedback;
