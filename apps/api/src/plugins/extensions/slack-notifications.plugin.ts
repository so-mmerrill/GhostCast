import { Logger } from '@nestjs/common';
import {
  BasePlugin,
  PluginMetadata,
  PluginHooks,
} from '@ghostcast/plugin-sdk';
import {
  AuditEvent,
  CatalogItem,
  PluginType,
  PluginScope,
  IntegrationCategory,
} from '@ghostcast/shared';

type DateValue = string | Date | null;

/**
 * Slack Notifications Extension
 *
 * Sends notifications to a Slack channel via webhook when audit events occur.
 * Configurable to filter by action type (CREATE, UPDATE, DELETE) and entity type
 * (User, Member, Assignment, Request, etc.) using multiselect dropdowns.
 */
export class SlackNotificationsPlugin extends BasePlugin {
  private readonly logger = new Logger(SlackNotificationsPlugin.name);

  readonly metadata: PluginMetadata = {
    name: 'slack-notifications',
    version: '1.0.0',
    displayName: 'Slack Notifications',
    description: 'Send notifications to Slack channels when events occur',
    author: 'GhostCast Team',
  };

  getCatalogEntry(): CatalogItem {
    return {
      id: 'slack-notifications',
      type: PluginType.EXTENSION,
      scope: PluginScope.SYSTEM,
      name: 'slack-notifications',
      displayName: 'Slack Notifications',
      description:
        'Send notifications to Slack channels when assignments are created, updated, or deleted. Keep your team informed in real-time.',
      icon: 'MessageSquare',
      category: IntegrationCategory.COMMUNICATION,
      author: 'GhostCast Team',
      version: '1.0.0',
      tags: ['Admin', 'slack', 'notifications', 'messaging'],
      configSchema: [
        {
          key: 'webhookUrl',
          type: 'string',
          label: 'Webhook URL',
          description: 'Slack Incoming Webhook URL',
          required: true,
        },
        {
          key: 'channel',
          type: 'string',
          label: 'Default Channel',
          description: 'Default channel for notifications (e.g., #general)',
          default: '#general',
        },
        {
          key: 'notifyActions',
          type: 'multiselect',
          label: 'Notification Actions',
          description: 'Which actions should trigger notifications',
          default: ['CREATE', 'DELETE'],
          options: [],
        },
        {
          key: 'notifyEntities',
          type: 'multiselect',
          label: 'Notification Entities',
          description: 'Which entity types should trigger notifications',
          default: ['Assignment', 'Request'],
          options: [],
        },
      ],
    };
  }

  async onEnable(config: Record<string, unknown>): Promise<void> {
    await super.onEnable(config);

    const webhookUrl = this.getConfig<string>('webhookUrl');
    if (!webhookUrl) {
      throw new Error('Webhook URL is required');
    }

    this.logger.log('Slack Notifications enabled');
  }

  async onDisable(): Promise<void> {
    await super.onDisable();
    this.logger.log('Slack Notifications disabled');
  }

  getHooks(): Partial<PluginHooks> {
    return {
      onAuditEvent: this.handleAuditEvent.bind(this),
    };
  }

  private async handleAuditEvent(event: AuditEvent): Promise<void> {
    if (!this.isEnabled) return;

    const { auditLog } = event;
    const action = auditLog.action;
    const entity = auditLog.entity;

    // Get configured actions and entities from multiselect config
    const notifyActions = this.getConfig<string[]>('notifyActions', ['CREATE', 'DELETE']);
    const notifyEntities = this.getConfig<string[]>('notifyEntities', ['Assignment', 'Request']);

    // Check if we should notify for this action type
    if (!notifyActions.includes(action)) return;

    // Check if we should notify for this entity type
    if (!notifyEntities.includes(entity)) return;

    // Skip non-entity actions like LOGIN/LOGOUT
    if (['LOGIN', 'LOGOUT', 'VIEW'].includes(action)) return;

    try {
      await this.sendSlackMessage(auditLog);
    } catch (error) {
      this.logger.error(`Failed to send Slack notification: ${error}`);
    }
  }

  private async sendSlackMessage(auditLog: AuditEvent['auditLog']): Promise<void> {
    const webhookUrl = this.getConfig<string>('webhookUrl');
    const channel = this.getConfig<string>('channel', '#general');

    if (!webhookUrl) {
      this.logger.warn('No webhook URL configured');
      return;
    }

    // Build the message
    const emoji = this.getActionEmoji(auditLog.action);
    const actionVerb = this.getActionVerb(auditLog.action);
    const entityType = auditLog.entity;

    // Format entity name if available
    let entityName = '';
    // First check metadata.entityName (populated by audit interceptor for DELETE actions)
    const metadata = auditLog.metadata as Record<string, unknown> | null;
    if (metadata?.entityName && typeof metadata.entityName === 'string') {
      entityName = metadata.entityName;
    } else if (auditLog.newValue && typeof auditLog.newValue === 'object') {
      const newValue = auditLog.newValue as Record<string, unknown>;
      if (typeof newValue.title === 'string') {
        entityName = newValue.title;
      } else if (typeof newValue.name === 'string') {
        entityName = newValue.name;
      } else if (typeof newValue.firstName === 'string' && typeof newValue.lastName === 'string') {
        entityName = `${newValue.firstName} ${newValue.lastName}`;
      }
    }

    // Get user who performed the action
    let performedBy = 'System';
    if (auditLog.user) {
      performedBy = `${auditLog.user.firstName} ${auditLog.user.lastName}`;
    }

    // Build main message text
    const entityDisplay = entityName ? `*${entityName}*` : `\`${auditLog.entityId || 'N/A'}\``;

    // Extract entity-specific details (members and dates)
    const entityDetails = this.getEntityDetails(auditLog, metadata);

    const blocks: Array<Record<string, unknown>> = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${entityType}* ${actionVerb}: ${entityDisplay}`,
        },
      },
    ];

    // Add entity details block if we have members or dates
    if (entityDetails) {
      blocks.push({
        type: 'section',
        fields: entityDetails,
      });
    }

    // Add context block
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `By: *${performedBy}* | Time: ${new Date(auditLog.createdAt).toLocaleString()}`,
        },
      ],
    });

    const message = {
      channel,
      username: 'GhostCast',
      icon_emoji: ':ghost:',
      blocks,
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Slack API error: ${response.status} - ${errorText}`);
    }

    this.logger.debug(`Sent Slack notification for ${auditLog.action} ${entityType}: ${entityName || auditLog.entityId}`);
  }

  private getActionEmoji(action: string): string {
    switch (action) {
      case 'CREATE':
        return ':heavy_plus_sign:';
      case 'UPDATE':
        return ':pencil2:';
      case 'DELETE':
        return ':x:';
      default:
        return ':bell:';
    }
  }

  private getActionVerb(action: string): string {
    switch (action) {
      case 'CREATE':
        return 'created';
      case 'UPDATE':
        return 'updated';
      case 'DELETE':
        return 'deleted';
      default:
        return action.toLowerCase();
    }
  }

  private getEntityDetails(
    auditLog: AuditEvent['auditLog'],
    metadata: Record<string, unknown> | null
  ): Array<{ type: string; text: string }> | null {
    const fields: Array<{ type: string; text: string }> = [];

    // For DELETE, use oldValue (the entity before deletion)
    // For CREATE/UPDATE, use newValue (the current state)
    const entityData = (
      auditLog.action === 'DELETE'
        ? auditLog.oldValue || metadata
        : auditLog.newValue || metadata
    ) as Record<string, unknown> | null;

    if (!entityData) return null;

    // Extract members based on entity type
    const members = this.extractMembers(entityData, auditLog.entity);
    if (members) {
      fields.push({
        type: 'mrkdwn',
        text: `*Members:*\n${members}`,
      });
    }

    // Extract dates based on entity type
    const dates = this.extractDates(entityData, auditLog.entity);
    if (dates) {
      fields.push({
        type: 'mrkdwn',
        text: `*Scheduled:*\n${dates}`,
      });
    }

    return fields.length > 0 ? fields : null;
  }

  private extractMembers(data: Record<string, unknown>, entity: string): string | null {
    let membersList: Array<Record<string, unknown>> | null = null;

    // Assignment uses 'members', Request uses 'requiredMembers'
    if (entity === 'Assignment' && Array.isArray(data.members)) {
      membersList = data.members as Array<Record<string, unknown>>;
    } else if (entity === 'Request' && Array.isArray(data.requiredMembers)) {
      membersList = data.requiredMembers as Array<Record<string, unknown>>;
    }

    if (!membersList || membersList.length === 0) return null;

    const names = membersList
      .map((m) => {
        const member = (m.member || m) as Record<string, unknown>;
        const firstName = member.firstName;
        const lastName = member.lastName;
        if (typeof firstName === 'string' && typeof lastName === 'string') {
          return `${firstName} ${lastName}`;
        }
        return null;
      })
      .filter(Boolean);

    if (names.length === 0) return null;
    return names.join(', ');
  }

  private extractDates(data: Record<string, unknown>, entity: string): string | null {
    let startDate: DateValue = null;
    let endDate: DateValue = null;

    if (entity === 'Assignment') {
      startDate = data.startDate as DateValue;
      endDate = data.endDate as DateValue;
    } else if (entity === 'Request') {
      startDate = data.requestedStartDate as DateValue;
      endDate = data.requestedEndDate as DateValue;
    }

    if (!startDate && !endDate) return null;

    const formatDate = (d: NonNullable<DateValue>): string => {
      const date = new Date(d);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    };

    if (startDate && endDate) {
      return `${formatDate(startDate)} → ${formatDate(endDate)}`;
    } else if (startDate) {
      return `From ${formatDate(startDate)}`;
    } else if (endDate) {
      return `Until ${formatDate(endDate)}`;
    }

    return null;
  }
}
