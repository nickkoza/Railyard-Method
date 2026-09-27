#!/usr/bin/env node
// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// railyard-ids-take ([8g5]).
import { main } from "../ids/cli.ts";
import { quietWhenTheReaderGoes } from "./pipe.ts";

quietWhenTheReaderGoes();
process.exitCode = await main(process.argv.slice(2));
