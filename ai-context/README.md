# AI Context Modules - CRM RealmKit

This directory contains modular AI context files designed to help AI assistants understand and work with specific CRM functionality. Each module is self-contained and can be loaded individually based on the development needs.

## Module Overview

| Module | File | Lines | Focus Area | Dependencies |
|--------|------|-------|------------|--------------|
| Core | `00-CORE.md` | ~500 | CRM architecture, data models, core patterns | None |
| Contacts | `01-CONTACTS.md` | ~600 | Contact management, import/export, deduplication | Core |
| Deals | `02-DEALS.md` | ~550 | Deal pipeline, stages, forecasting | Core, Contacts |
| Activities | `03-ACTIVITIES.md` | ~500 | Task management, calendar, notifications | Core, Contacts |
| Communications | `04-COMMUNICATIONS.md` | ~650 | Email tracking, call logs, meeting records | Core, Contacts |
| Reporting | `05-REPORTING.md` | ~550 | Analytics, dashboards, KPI tracking | Core, Contacts, Deals |
| Automation | `06-AUTOMATION.md` | ~450 | Workflow automation, triggers, sequences | Core, Contacts, Deals |

**Total Context Size**: ~3,800 lines across 7 modules

## Loading Strategy

### For New Features
Start with Core, then load specific modules based on the feature area:
- **Contact Features**: Load Core + Contacts
- **Sales Pipeline**: Load Core + Contacts + Deals
- **Task Management**: Load Core + Contacts + Activities
- **Email Features**: Load Core + Contacts + Communications
- **Analytics**: Load Core + Contacts + Deals + Reporting
- **Workflow Setup**: Load Core + Contacts + Deals + Automation

### For Bug Fixes
Load Core + the specific module related to the bug area.

### For Architecture Changes
Load Core + all dependent modules that might be affected.

## Usage Guidelines

1. **Start Small**: Always begin with `00-CORE.md` to understand the foundational patterns
2. **Load Incrementally**: Add modules as needed rather than loading everything at once
3. **Check Dependencies**: Ensure prerequisite modules are loaded before dependent ones
4. **Context Management**: Monitor AI context usage to avoid overload

## Module Descriptions

- **00-CORE**: Fundamental CRM architecture, database models, authentication, and shared utilities
- **01-CONTACTS**: Complete contact management system with import/export and deduplication
- **02-DEALS**: Sales pipeline management with deal stages and forecasting
- **03-ACTIVITIES**: Task and activity management with calendar integration
- **04-COMMUNICATIONS**: Email, call, and meeting tracking systems
- **05-REPORTING**: Analytics dashboards and KPI reporting
- **06-AUTOMATION**: Workflow automation and trigger systems

Each module contains:
- **Architectural patterns** with clear rationale
- **Complete code examples** that work out of the box
- **Database schemas** with proper relationships
- **API patterns** with validation and error handling
- **Testing strategies** for the specific domain
- **Security considerations** and best practices