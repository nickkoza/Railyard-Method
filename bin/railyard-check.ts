#!/usr/bin/env node
// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// railyard-check ([f4v]).
import { main } from "../method/check-cli.ts";
import { quietWhenTheReaderGoes } from "./pipe.ts";

quietWhenTheReaderGoes();
process.exitCode = main(process.argv.slice(2));
