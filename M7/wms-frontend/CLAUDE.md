# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WMS (Warehouse Management System) frontend — Angular app, sibling to `tms-frontend` and
`customer-portal` in this monorepo-of-apps.

## PDF generation

`src/app/lib/pdf/` follows a dedicated convention, imported here so it stays in context:

@.claude/rules/pdf-generation.md

To perform a migration onto that pipeline, use the **`pdf-refactor`** subagent.
