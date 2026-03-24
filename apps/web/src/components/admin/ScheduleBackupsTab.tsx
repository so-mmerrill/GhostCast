import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { format } from 'date-fns';
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  RotateCcw,
  Trash2,
  Settings,
  HardDrive,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type {
  BackupScheduleConfig,
  BackupRecordCounts,
  RestoreResult,
} from '@ghostcast/shared';

// ===========================================
// Types
// ===========================================

interface ScheduleBackup {
  id: string;
  type: 'FULL' | 'INCREMENTAL';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  label: string | null;
  description: string | null;
  parentBackupId: string | null;
  snapshotTimestamp: string;
  backupMonth: string;
  filePath: string;
  fileSizeBytes: number;
  recordCounts: BackupRecordCounts;
  triggeredBy: string | null;
  isAutomatic: boolean;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  childBackups?: { id: string; type: string; createdAt: string; status: string }[];
}

interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface BackupListResponse {
  data: ScheduleBackup[];
  meta: PaginationMeta;
}

// ===========================================
// Helpers
// ===========================================

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function totalRecords(counts: BackupRecordCounts): number {
  return (
    counts.requests +
    counts.assignments +
    counts.assignmentMembers +
    counts.assignmentSkills +
    counts.assignmentFormatters +
    counts.assignmentProjectRoles +
    counts.requestMembers +
    counts.requestSkills
  );
}

const TYPE_COLORS: Record<string, string> = {
  FULL: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  INCREMENTAL: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  PENDING: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

// ===========================================
// Main Component
// ===========================================

export function ScheduleBackupsTab() {
  return (
    <div className="mt-4 space-y-6">
      <BackupScheduleSettings />
      <BackupList />
    </div>
  );
}

// ===========================================
// Schedule Settings
// ===========================================

function BackupScheduleSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['backup-schedule'],
    queryFn: () => api.get<{ data: BackupScheduleConfig }>('/backups/schedule'),
  });

  const [localConfig, setLocalConfig] = useState<BackupScheduleConfig | null>(null);

  const scheduleConfig = localConfig || config?.data || {
    enabled: false,
    incrementalBackupIntervalMinutes: 0,
    retentionMonths: 12,
    maxBackups: 100,
  };

  const updateMutation = useMutation({
    mutationFn: (cfg: BackupScheduleConfig) =>
      api.put<{ data: BackupScheduleConfig }>('/backups/schedule', cfg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-schedule'] });
      setLocalConfig(null);
    },
  });

  const handleChange = (field: keyof BackupScheduleConfig, value: unknown) => {
    setLocalConfig((prev) => ({
      ...(prev || scheduleConfig),
      [field]: value,
    }));
  };

  const handleSave = () => {
    if (localConfig) {
      updateMutation.mutate(localConfig);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Backup Schedule</CardTitle>
                  <CardDescription>
                    Full backups run monthly when new assignments exist. Incremental backups run on a configurable interval.
                  </CardDescription>
                </div>
              </div>
              {isOpen ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {isLoading ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading configuration...</span>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="backup-enabled"
                    checked={scheduleConfig.enabled}
                    onCheckedChange={(checked) =>
                      handleChange('enabled', checked === true)
                    }
                  />
                  <Label htmlFor="backup-enabled">Enable scheduled backups</Label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="incremental-interval">
                      Incremental interval (minutes)
                    </Label>
                    <Input
                      id="incremental-interval"
                      type="number"
                      min={0}
                      value={scheduleConfig.incrementalBackupIntervalMinutes}
                      onChange={(e) =>
                        handleChange(
                          'incrementalBackupIntervalMinutes',
                          Number(e.target.value),
                        )
                      }
                    />
                    <p className="text-xs text-muted-foreground">0 = disabled</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="retention-months">Retention (months)</Label>
                    <Input
                      id="retention-months"
                      type="number"
                      min={1}
                      value={scheduleConfig.retentionMonths}
                      onChange={(e) =>
                        handleChange('retentionMonths', Number(e.target.value))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max-backups">Max backups</Label>
                    <Input
                      id="max-backups"
                      type="number"
                      min={1}
                      value={scheduleConfig.maxBackups}
                      onChange={(e) =>
                        handleChange('maxBackups', Number(e.target.value))
                      }
                    />
                  </div>
                </div>

                {localConfig && (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocalConfig(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      <Save className="h-4 w-4" />
                      Save
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ===========================================
// Backup List
// ===========================================

function BackupList() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [restoreTarget, setRestoreTarget] = useState<ScheduleBackup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleBackup | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);

  const queryClient = useQueryClient();

  // Build query params
  const buildQueryParams = () => {
    const params: Record<string, string> = {
      page: String(page),
      pageSize: String(pageSize),
    };
    if (typeFilter !== 'all') params.type = typeFilter;
    if (statusFilter !== 'all') params.status = statusFilter;
    return params;
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['backups', page, pageSize, typeFilter, statusFilter],
    queryFn: () =>
      api.get<{ data: BackupListResponse }>('/backups', buildQueryParams()),
  });

  const createMutation = useMutation({
    mutationFn: (type: 'FULL' | 'INCREMENTAL') =>
      api.post('/backups', { type }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: ({ id, dryRun: dr }: { id: string; dryRun: boolean }) =>
      api.post<{ data: RestoreResult }>(`/backups/${id}/restore`, {
        dryRun: dr,
      }),
    onSuccess: (result) => {
      setRestoreTarget(null);
      setRestoreResult(result.data);
      queryClient.invalidateQueries({ queryKey: ['backups'] });
      // After a real restore (not dry run), invalidate schedule data so the calendar updates
      if (!result.data.dryRun) {
        queryClient.invalidateQueries({ queryKey: ['schedule'], refetchType: 'all' });
        queryClient.invalidateQueries({ queryKey: ['requests-for-schedule'], refetchType: 'all' });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/backups/${id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
  });

  const backups = data?.data?.data ?? [];
  const paginationMeta = data?.data?.meta;

  const toggleRowExpanded = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center text-destructive">
        <p>Failed to load backups. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => createMutation.mutate('FULL')}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Full Backup
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => createMutation.mutate('INCREMENTAL')}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Incremental Backup
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="FULL">Full</SelectItem>
              <SelectItem value="INCREMENTAL">Incremental</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10" />
              <TableHead>Type</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Month</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Records</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="h-64 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading backups...</span>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!isLoading && backups.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="h-64 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <HardDrive className="h-8 w-8" />
                    <span>No backups found</span>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              backups.map((backup) => (
                <BackupRow
                  key={backup.id}
                  backup={backup}
                  isExpanded={expandedRows.has(backup.id)}
                  onToggle={() => toggleRowExpanded(backup.id)}
                  onRestore={() => {
                    setRestoreTarget(backup);
                    setDryRun(false);
                  }}
                  onDelete={() => setDeleteTarget(backup)}
                />
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {paginationMeta && paginationMeta.totalPages > 0 && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to{' '}
            {Math.min(page * pageSize, paginationMeta.total)} of{' '}
            {paginationMeta.total} backups
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Rows per page:
              </span>
              <Select
                value={pageSize.toString()}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-sm">
                Page {page} of {paginationMeta.totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(page + 1)}
                disabled={page === paginationMeta.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Dialog */}
      {restoreTarget && (
        <Dialog
          open={!!restoreTarget}
          onOpenChange={(open) => {
            if (!open) setRestoreTarget(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Restore from Backup</DialogTitle>
              <DialogDescription>
                This will replace all current schedule data (requests,
                assignments, and all member assignments) with the data from this
                backup. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded border p-3 text-sm">
                <p>
                  <strong>Backup:</strong> {restoreTarget.label}
                </p>
                <p>
                  <strong>Type:</strong> {restoreTarget.type}
                </p>
                <p>
                  <strong>Date:</strong>{' '}
                  {format(new Date(restoreTarget.createdAt), 'yyyy-MM-dd HH:mm')}
                </p>
                <p>
                  <strong>Records:</strong>{' '}
                  {totalRecords(restoreTarget.recordCounts).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="dry-run"
                  checked={dryRun}
                  onCheckedChange={(checked) => setDryRun(checked === true)}
                />
                <Label htmlFor="dry-run">
                  Dry run (simulate without making changes)
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRestoreTarget(null)}
                disabled={restoreMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant={dryRun ? 'default' : 'destructive'}
                onClick={() =>
                  restoreMutation.mutate({
                    id: restoreTarget.id,
                    dryRun,
                  })
                }
                disabled={restoreMutation.isPending}
              >
                {restoreMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                <RotateCcw className="h-4 w-4" />
                {dryRun ? 'Simulate Restore' : 'Restore'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Restore Result Dialog */}
      {restoreResult && (
        <Dialog
          open={!!restoreResult}
          onOpenChange={(open) => {
            if (!open) setRestoreResult(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {restoreResult.dryRun ? 'Dry Run Result' : 'Restore Complete'}
              </DialogTitle>
              <DialogDescription>
                {restoreResult.dryRun
                  ? 'No changes were made. Here is what would be restored:'
                  : 'The schedule has been restored successfully.'}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded border p-3 text-sm space-y-1">
              <p>Requests: {restoreResult.recordCounts.requests}</p>
              <p>Assignments: {restoreResult.recordCounts.assignments}</p>
              <p>
                Assignment Members:{' '}
                {restoreResult.recordCounts.assignmentMembers}
              </p>
              <p>
                Assignment Skills:{' '}
                {restoreResult.recordCounts.assignmentSkills}
              </p>
              <p>
                Request Members: {restoreResult.recordCounts.requestMembers}
              </p>
              <p>Request Skills: {restoreResult.recordCounts.requestSkills}</p>
            </div>
            <DialogFooter>
              <Button onClick={() => setRestoreResult(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title="Delete Backup"
          description={`Are you sure you want to delete "${deleteTarget.label}"? This will remove both the backup metadata and the JSON file from disk. This action cannot be undone.`}
          confirmText="Delete"
          variant="destructive"
          isLoading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </div>
  );
}

// ===========================================
// Backup Row
// ===========================================

function BackupRow({
  backup,
  isExpanded,
  onToggle,
  onRestore,
  onDelete,
}: Readonly<{
  backup: ScheduleBackup;
  isExpanded: boolean;
  onToggle: () => void;
  onRestore: () => void;
  onDelete: () => void;
}>) {
  return (
    <>
      <TableRow
        className="cursor-pointer transition-colors hover:bg-muted/50"
        onClick={onToggle}
      >
        <TableCell>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </TableCell>
        <TableCell>
          <Badge className={TYPE_COLORS[backup.type]}>{backup.type}</Badge>
        </TableCell>
        <TableCell className="font-medium">
          {backup.label || backup.filePath}
        </TableCell>
        <TableCell className="font-mono text-sm">{backup.backupMonth}</TableCell>
        <TableCell className="text-sm">
          {format(new Date(backup.createdAt), 'yyyy-MM-dd HH:mm')}
        </TableCell>
        <TableCell>
          <Badge className={STATUS_COLORS[backup.status]}>
            {backup.status}
          </Badge>
        </TableCell>
        <TableCell className="text-sm">
          {totalRecords(backup.recordCounts).toLocaleString()}
        </TableCell>
        <TableCell className="text-sm">
          {formatFileSize(backup.fileSizeBytes)}
        </TableCell>
        <TableCell>
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            className="flex items-center gap-1 min-w-0"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onRestore}
              disabled={backup.status !== 'COMPLETED'}
              title="Restore from this backup"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={onDelete}
              title="Delete this backup"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={9} className="bg-muted/30 p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium mb-2">Record Breakdown</h4>
                <div className="space-y-1 text-muted-foreground">
                  <p>Requests: {backup.recordCounts.requests}</p>
                  <p>Assignments: {backup.recordCounts.assignments}</p>
                  <p>
                    Assignment Members:{' '}
                    {backup.recordCounts.assignmentMembers}
                  </p>
                  <p>
                    Assignment Skills:{' '}
                    {backup.recordCounts.assignmentSkills}
                  </p>
                  <p>
                    Assignment Formatters:{' '}
                    {backup.recordCounts.assignmentFormatters}
                  </p>
                  <p>
                    Assignment Project Roles:{' '}
                    {backup.recordCounts.assignmentProjectRoles}
                  </p>
                  <p>
                    Request Members: {backup.recordCounts.requestMembers}
                  </p>
                  <p>Request Skills: {backup.recordCounts.requestSkills}</p>
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">Details</h4>
                <div className="space-y-1 text-muted-foreground">
                  <p>File: {backup.filePath}</p>
                  <p>
                    Triggered:{' '}
                    {backup.isAutomatic ? 'Automatic' : 'Manual'}
                  </p>
                  {backup.parentBackupId && (
                    <p>
                      Parent:{' '}
                      <span className="font-mono text-xs">
                        {backup.parentBackupId.slice(0, 12)}...
                      </span>
                    </p>
                  )}
                  {backup.completedAt && (
                    <p>
                      Completed:{' '}
                      {format(
                        new Date(backup.completedAt),
                        'yyyy-MM-dd HH:mm:ss',
                      )}
                    </p>
                  )}
                  {backup.errorMessage && (
                    <p className="text-destructive">
                      Error: {backup.errorMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
