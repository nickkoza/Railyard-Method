#!/usr/bin/env node
// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// railyard-trace ([QzV]).
import { main } from "../traceability/cli.ts";
import { quietWhenTheReaderGoes } from "./pipe.ts";

quietWhenTheReaderGoes();
process.exitCode = main(process.argv.slice(2));
