#!/usr/bin/env node
// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// railyard-ids-resolve ([BNb], [Bvq]).
import { main } from "../ids/resolve.ts";
import { quietWhenTheReaderGoes } from "./pipe.ts";

quietWhenTheReaderGoes();
process.exitCode = main(process.argv.slice(2));
