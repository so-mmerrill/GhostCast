# @ghostcast/plugin-sdk

SDK for developing GhostCast plugins. Provides base classes, interfaces, and decorators for building extensions that hook into the GhostCast application lifecycle.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Plugin Anatomy](#plugin-anatomy)
  - [Metadata](#metadata)
  - [Catalog Entry](#catalog-entry)
  - [Configuration Schema](#configuration-schema)
  - [Lifecycle Hooks](#lifecycle-hooks)
  - [Event Hooks](#event-hooks)
  - [Extension Points](#extension-points)
- [Registering a Plugin](#registering-a-plugin)
- [Example: Hello World Plugin](#example-hello-world-plugin)
- [API Reference](#api-reference)

## Overview

The plugin SDK exposes a `BasePlugin` class and a `GhostSyncPlugin` interface. Every plugin:

1. Extends `BasePlugin` (or implements `GhostSyncPlugin` directly).
2. Declares metadata (name, version, description).
3. Optionally provides a catalog entry so the admin UI can display and configure it.
4. Hooks into application events (assignments created, members updated, audit events, etc.).
5. Can register extension points (API routes, scheduled jobs, notification channels, and more).

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   GhostCast API                      │
│                                                      │
│  ┌──────────────┐   ┌──────────────────────────────┐ │
│  │PluginsModule │──▶│ PluginRegistry               │ │
│  │ (bootstrap)  │   │  .register(plugin)           │ │
│  └──────────────┘   │  .get(name)                  │ │
│                     │  .getAll()                    │ │
│                     │  .getCatalogEntries()         │ │
│                     └──────────────────────────────┘ │
│                              │                       │
│           ┌──────────────────┼──────────────┐        │
│           ▼                  ▼              ▼        │
│  ┌────────────────┐ ┌──────────────┐ ┌───────────┐  │
│  │ SlackPlugin    │ │ YourPlugin   │ │ ...       │  │
│  │ (BasePlugin)   │ │ (BasePlugin) │ │           │  │
│  └────────────────┘ └──────────────┘ └───────────┘  │
└──────────────────────────────────────────────────────┘
```

**Bootstrap flow:**

1. `PluginsModule.onModuleInit()` instantiates each built-in plugin.
2. Each instance is registered with `PluginRegistry`.
3. Plugins that were previously enabled (persisted in the database) have their `onEnable()` lifecycle hook called with the saved config.
4. At runtime, the `PluginAuditListener` dispatches audit events to enabled plugins via their registered hooks.

## Quick Start

```typescript
import { BasePlugin, PluginMetadata, PluginHooks } from '@ghostcast/plugin-sdk';

export class MyPlugin extends BasePlugin {
  readonly metadata: PluginMetadata = {
    name: 'my-plugin',
    version: '1.0.0',
    displayName: 'My Plugin',
    description: 'A short description of what this plugin does',
    author: 'Your Name',
  };

  getHooks(): Partial<PluginHooks> {
    return {
      onAfterAssignmentCreate: async (assignment, context) => {
        this.log(`Assignment created: ${assignment.id}`);
      },
    };
  }
}
```

## Plugin Anatomy

### Metadata

Every plugin must declare a `metadata` property of type `PluginMetadata`:

| Field           | Type       | Required | Description                              |
| --------------- | ---------- | -------- | ---------------------------------------- |
| `name`          | `string`   | Yes      | Unique identifier (kebab-case)           |
| `version`       | `string`   | Yes      | Semantic version                         |
| `displayName`   | `string`   | Yes      | Human-readable name                      |
| `description`   | `string`   | Yes      | Short description                        |
| `author`        | `string`   | No       | Plugin author                            |
| `homepage`      | `string`   | No       | Documentation URL                        |
| `minAppVersion` | `string`   | No       | Minimum GhostCast version required       |
| `dependencies`  | `string[]` | No       | Other plugin names this plugin depends on|

### Catalog Entry

Implement `getCatalogEntry()` to make your plugin appear in the admin Integrations UI. The catalog entry controls how the plugin is displayed, what configuration fields are shown, and what actions are available.

```typescript
import { CatalogItem, PluginType, PluginScope, IntegrationCategory } from '@ghostcast/shared';

getCatalogEntry(): CatalogItem {
  return {
    id: 'my-plugin',
    type: PluginType.EXTENSION,
    scope: PluginScope.SYSTEM,       // SYSTEM = admin-only, USER = per-user
    name: 'my-plugin',
    displayName: 'My Plugin',
    description: 'What the admin sees in the catalog.',
    icon: 'Bell',                    // Lucide icon name
    category: IntegrationCategory.COMMUNICATION,
    author: 'Your Name',
    version: '1.0.0',
    tags: ['Admin', 'notifications'],
    configSchema: [
      {
        key: 'apiKey',
        type: 'password',
        label: 'API Key',
        description: 'Your service API key',
        required: true,
      },
    ],
  };
}
```

### Configuration Schema

The `configSchema` array in your catalog entry defines the admin UI form fields. Supported field types:

| Type          | Description                        |
| ------------- | ---------------------------------- |
| `string`      | Text input                         |
| `number`      | Numeric input (supports min/max)   |
| `boolean`     | Toggle switch                      |
| `password`    | Masked text input                  |
| `textarea`    | Multi-line text input              |
| `select`      | Single-select dropdown             |
| `multiselect` | Multi-select dropdown              |

Access config values in your plugin with the built-in helper:

```typescript
const apiKey = this.getConfig<string>('apiKey');
const retries = this.getConfig<number>('maxRetries', 3); // with default
```

### Lifecycle Hooks

`BasePlugin` provides default implementations for all lifecycle methods. Override only the ones you need:

| Method           | When it runs                                    |
| ---------------- | ----------------------------------------------- |
| `onLoad(app)`    | Plugin loaded into memory (receives NestJS app) |
| `onEnable(config)` | Plugin is enabled by an admin                 |
| `onDisable()`    | Plugin is disabled by an admin                  |
| `onUnload()`     | Plugin is removed from memory                   |
| `onConfigUpdate(oldConfig, newConfig)` | Admin saves new config      |
| `healthCheck()`  | Periodic health monitoring                      |

Always call `super` when overriding lifecycle methods to preserve base behavior:

```typescript
async onEnable(config: Record<string, unknown>): Promise<void> {
  await super.onEnable(config);
  // your initialization logic
}
```

### Event Hooks

Implement `getHooks()` to subscribe to application events. Return an object with only the hooks you need:

```typescript
getHooks(): Partial<PluginHooks> {
  return {
    onAfterAssignmentCreate: this.handleAssignmentCreated.bind(this),
    onAuditEvent: this.handleAudit.bind(this),
  };
}
```

**Available hooks:**

| Hook | Description |
| ---- | ----------- |
| `onBeforeAssignmentCreate` | Before assignment creation (can modify input or cancel) |
| `onAfterAssignmentCreate` | After assignment creation |
| `onBeforeAssignmentUpdate` | Before assignment update (can modify changes or cancel) |
| `onAfterAssignmentUpdate` | After assignment update |
| `onBeforeAssignmentDelete` | Before assignment deletion (can cancel) |
| `onAfterAssignmentDelete` | After assignment deletion |
| `onMemberCreate` | After member creation |
| `onMemberUpdate` | After member update |
| `onMemberDelete` | After member deletion |
| `onUserLogin` | After user login |
| `onUserLogout` | After user logout |
| `onUserCreate` | After user creation |
| `onUserUpdate` | After user update |
| `onBeforeNotificationSend` | Before notification (can modify or cancel) |
| `onAfterNotificationSend` | After notification sent |
| `onAppStart` | Application startup |
| `onAppShutdown` | Application shutdown |
| `onScheduledTask` | Periodic scheduled task |
| `onAuditEvent` | Any audit event occurs |

**"Before" hooks** return a `HookResult` that can modify data or cancel the operation:

```typescript
async onBeforeAssignmentCreate(
  input: AssignmentCreateInput,
  context: HookContext
): Promise<HookResult<AssignmentCreateInput>> {
  // Allow creation, but modify the input
  return { continue: true, data: { ...input, notes: 'Auto-tagged' } };

  // Or cancel the operation
  return { continue: false, error: 'Not allowed on weekends' };
}
```

### Extension Points

Override `getExtensionPoints()` to register API routes, scheduled jobs, notification channels, and more:

```typescript
getExtensionPoints(): ExtensionPoints {
  return {
    routes: [
      {
        method: 'GET',
        path: '/status',         // served at /api/plugins/my-plugin/status
        handler: async (req, res) => { /* ... */ },
        description: 'Get plugin status',
      },
    ],
    scheduledJobs: [
      {
        name: 'daily-sync',
        cron: '0 0 * * *',      // midnight daily
        handler: async () => { /* ... */ },
        description: 'Daily data sync',
      },
    ],
  };
}
```

**Available extension points:**

| Extension Point        | Description                                  |
| ---------------------- | -------------------------------------------- |
| `routes`               | Custom API endpoints                         |
| `webSocketHandlers`    | WebSocket event handlers                     |
| `scheduledJobs`        | Cron-based background jobs                   |
| `notificationChannels` | Custom notification delivery channels        |
| `adminPages`           | Custom pages in the admin UI                 |
| `calendarExtensions`   | Extra data or components on calendar cards   |
| `reports`              | Custom report definitions                    |
| `apiDataSources`       | External data source connectors              |

## Registering a Plugin

Once your plugin class is written, register it in the `PluginsModule` so GhostCast loads it at startup.

**1. Add the import in `apps/api/src/plugins/extensions/index.ts`:**

```typescript
export { SlackNotificationsPlugin } from './slack-notifications.plugin';
export { MyPlugin } from './my-plugin.plugin';
```

**2. Add the instance in `apps/api/src/plugins/plugins.module.ts`:**

```typescript
import { SlackNotificationsPlugin, MyPlugin } from './extensions';

// Inside onModuleInit():
const builtInExtensions = [
  new SlackNotificationsPlugin(),
  new MyPlugin(),
  // Add more extensions here as they are implemented
];
```

That's it. The module registers your plugin with the `PluginRegistry`, and the application handles enabling, disabling, config persistence, and event dispatch automatically.

## Example: Hello World Plugin

A minimal plugin that logs assignment activity and exposes a health endpoint.

```typescript
// apps/api/src/plugins/extensions/hello-world.plugin.ts

import { Logger } from '@nestjs/common';
import {
  BasePlugin,
  PluginMetadata,
  PluginConfigSchema,
  PluginHooks,
  PluginHealthCheck,
} from '@ghostcast/plugin-sdk';
import {
  CatalogItem,
  PluginType,
  PluginScope,
  IntegrationCategory,
  Assignment,
  HookContext,
} from '@ghostcast/shared';

export class HelloWorldPlugin extends BasePlugin {
  private readonly logger = new Logger(HelloWorldPlugin.name);
  private eventCount = 0;

  readonly metadata: PluginMetadata = {
    name: 'hello-world',
    version: '1.0.0',
    displayName: 'Hello World',
    description: 'A simple example plugin that logs assignment events',
    author: 'GhostCast Team',
  };

  // ── Catalog Entry ─────────────────────────────────────────────
  // Makes the plugin visible in the admin Integrations page.

  getCatalogEntry(): CatalogItem {
    return {
      id: 'hello-world',
      type: PluginType.EXTENSION,
      scope: PluginScope.SYSTEM,
      name: 'hello-world',
      displayName: 'Hello World',
      description: 'Logs assignment creation and deletion events. Great as a starting point for new plugins.',
      icon: 'HandMetal',
      category: IntegrationCategory.PRODUCTIVITY,
      author: 'GhostCast Team',
      version: '1.0.0',
      tags: ['Admin', 'example', 'logging'],
      configSchema: [
        {
          key: 'greeting',
          type: 'string',
          label: 'Greeting Message',
          description: 'Message to include in log output',
          default: 'Hello from GhostCast!',
        },
        {
          key: 'verbose',
          type: 'boolean',
          label: 'Verbose Logging',
          description: 'Log full assignment details',
          default: false,
        },
      ],
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  async onEnable(config: Record<string, unknown>): Promise<void> {
    await super.onEnable(config);
    const greeting = this.getConfig<string>('greeting', 'Hello from GhostCast!');
    this.logger.log(greeting);
  }

  async onDisable(): Promise<void> {
    this.logger.log(`Goodbye! Processed ${this.eventCount} events while enabled.`);
    this.eventCount = 0;
    await super.onDisable();
  }

  // ── Event Hooks ───────────────────────────────────────────────

  getHooks(): Partial<PluginHooks> {
    return {
      onAfterAssignmentCreate: this.onAssignmentCreated.bind(this),
      onAfterAssignmentDelete: this.onAssignmentDeleted.bind(this),
    };
  }

  private async onAssignmentCreated(assignment: Assignment, context: HookContext): Promise<void> {
    if (!this.isEnabled) return;
    this.eventCount++;

    const verbose = this.getConfig<boolean>('verbose', false);
    if (verbose) {
      this.logger.log(`Assignment created: ${JSON.stringify(assignment)}`);
    } else {
      this.logger.log(`Assignment created: ${assignment.id} by ${context.user?.firstName ?? 'system'}`);
    }
  }

  private async onAssignmentDeleted(id: string, context: HookContext): Promise<void> {
    if (!this.isEnabled) return;
    this.eventCount++;
    this.logger.log(`Assignment deleted: ${id} by ${context.user?.firstName ?? 'system'}`);
  }

  // ── Health Check ──────────────────────────────────────────────

  async healthCheck(): Promise<PluginHealthCheck> {
    return {
      healthy: this.isEnabled,
      message: this.isEnabled
        ? `Running — ${this.eventCount} events processed`
        : 'Plugin is disabled',
      details: { eventCount: this.eventCount },
    };
  }
}
```

**Register it** by adding to the built-in extensions array in `plugins.module.ts`:

```typescript
import { SlackNotificationsPlugin, HelloWorldPlugin } from './extensions';

const builtInExtensions = [
  new SlackNotificationsPlugin(),
  new HelloWorldPlugin(),
];
```

Once registered, the plugin appears in the admin Integrations page where it can be enabled, configured, and monitored.

## API Reference

### BasePlugin (class)

| Member | Type | Description |
| ------ | ---- | ----------- |
| `metadata` | `PluginMetadata` | Abstract — must be defined by subclass |
| `configSchema` | `PluginConfigSchema` | Optional config schema |
| `app` | `INestApplication` | NestJS app instance (available after `onLoad`) |
| `config` | `Record<string, unknown>` | Current plugin configuration |
| `isEnabled` | `boolean` | Whether the plugin is currently enabled |
| `getConfig<T>(key, default?)` | `T` | Type-safe config value accessor |
| `log(message, level?)` | `void` | Log with plugin name prefix |
| `emit(event, payload)` | `Promise<void>` | Emit event via NestJS EventEmitter2 |
| `getService<T>(token)` | `T \| undefined` | Resolve a service from the NestJS DI container |

### @Plugin() (decorator)

Class decorator that attaches `PluginMetadata` via `Reflect.defineMetadata`. Useful for frameworks that inspect metadata at registration time:

```typescript
import { Plugin } from '@ghostcast/plugin-sdk';

@Plugin({
  name: 'my-plugin',
  version: '1.0.0',
  displayName: 'My Plugin',
  description: 'Decorated plugin',
})
export class MyPlugin extends BasePlugin {
  // metadata is applied via decorator — no need to redeclare
}
```

Retrieve it programmatically with `getPluginMetadata(instance)`.

### Exports

Everything is exported from the package root:

```typescript
import {
  // Interfaces
  GhostSyncPlugin,
  PluginMetadata,
  PluginConfigSchema,
  PluginConfigField,
  PluginHealthCheck,
  PluginRegistration,
  PluginState,
  PluginHooks,
  HookContext,
  HookResult,
  HookPriority,
  ExtensionPoints,
  RouteDefinition,
  WebSocketHandler,
  ScheduledJob,
  NotificationChannel,
  NotificationPayload,
  AdminPageDefinition,
  CalendarExtension,
  ReportDefinition,
  ReportResult,
  ApiDataSource,

  // Base class
  BasePlugin,

  // Decorator
  Plugin,
  getPluginMetadata,
} from '@ghostcast/plugin-sdk';
```
