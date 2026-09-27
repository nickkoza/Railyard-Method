#!/usr/bin/env node
// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// railyard-upgrade ([o7Y]).
import { main } from "../method/upgrade-cli.ts";
import { quietWhenTheReaderGoes } from "./pipe.ts";

quietWhenTheReaderGoes();
process.exitCode = await main();
