import { useState } from 'react';
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useDataManagement } from './hooks/useDataManagement';
import { DataEntityConfig } from './configs/types';
import { GenericDataDialog } from './GenericDataDialog';

interface GenericDataTableProps<T extends { id: string; isActive?: boolean }> {
  readonly config: DataEntityConfig<T>;
}

export function GenericDataTable<T extends { id: string; isActive?: boolean; name?: string; color?: string | null }>({
  config,
}: Readonly<GenericDataTableProps<T>>) {
  const [page, setPage] = useState(1);
  const pageSize = config.pageSize ?? 10;
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<T | null>(null);
  const [duplicatingItem, setDuplicatingItem] = useState<T | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { useList, useDelete } = useDataManagement<T>({
    endpoint: config.apiEndpoint,
    queryKey: config.queryKey,
  });

  const { data: rawData, isLoading, error } = useList({ page, pageSize, search });
  const deleteMutation = useDelete();

  // Handle multiple possible API response structures
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = rawData as any;

  const getDataArray = (): T[] => {
    if (!response) return [];
    // Check for { data: [...] } structure
    if (Array.isArray(response.data)) return response.data;
    // Check for { data: { data: [...] } } structure (doubly wrapped)
    if (response.data?.data && Array.isArray(response.data.data)) return response.data.data;
    // Check for direct array
    if (Array.isArray(response)) return response;
    return [];
  };

  const getMeta = (): { total: number; page: number; pageSize: number; totalPages: number } | null => {
    if (!response) return null;
    // Check for { data: { meta: {...} } } structure (doubly wrapped by transform interceptor)
    // This must be checked first because response.meta might be the interceptor's timestamp meta
    if (response.data?.meta?.totalPages !== undefined) return response.data.meta;
    // Check for { meta: {...} } structure with pagination properties
    if (response.meta?.totalPages !== undefined) return response.meta;
    return null;
  };

  const items = getDataArray();
  const meta = getMeta();

  const handleCreate = () => {
    setEditingItem(null);
    setDuplicatingItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (item: T) => {
    setEditingItem(item);
    setDuplicatingItem(null);
    setDialogOpen(true);
  };

  const handleDuplicate = (item: T) => {
    setEditingItem(null);
    setDuplicatingItem(item);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      setDeleteConfirmId(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const renderTableBodyContent = () => {
    if (isLoading) {
      return (
        <TableRow>
          <TableCell colSpan={config.columns.length + 1} className="text-center py-8">
            Loading...
          </TableCell>
        </TableRow>
      );
    }

    if (items.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={config.columns.length + 1} className="text-center py-8 text-muted-foreground">
            No {config.pluralName.toLowerCase()} found
          </TableCell>
        </TableRow>
      );
    }

    return items.map((item) => (
      <TableRow key={item.id}>
        {config.columns.map((column) => (
          <TableCell key={String(column.key)}>
            {column.render
              ? column.render(item)
              : renderCellValue(item, String(column.key))}
          </TableCell>
        ))}
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleEdit(item)}
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDuplicate(item)}
              title="Duplicate"
            >
              <Copy className="h-4 w-4" />
            </Button>
            {deleteConfirmId === item.id ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(item.id)}
                  disabled={deleteMutation.isPending}
                >
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteConfirmId(item.id)}
                title="Delete"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive transition-colors" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    ));
  };

  const renderCellValue = (item: T, key: string) => {
    const value = item[key as keyof T];

    // Handle color column
    if (key === 'color' && typeof value === 'string') {
      return (
        <div className="flex items-center gap-2">
          <div
            className="h-5 w-5 rounded border"
            style={{ backgroundColor: value }}
          />
          <span className="text-xs text-muted-foreground">{value}</span>
        </div>
      );
    }

    // Handle isActive column
    if (key === 'isActive') {
      return (
        <Badge variant={value ? 'default' : 'secondary'}>
          {value ? 'Active' : 'Inactive'}
        </Badge>
      );
    }

    // Handle null/undefined
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">-</span>;
    }

    // Default: render as string
    return String(value);
  };

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
        Error loading data: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`Search ${config.pluralName.toLowerCase()}...`}
            value={search}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add {config.displayName}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {config.columns.map((column) => (
                <TableHead key={String(column.key)} style={{ width: column.width }}>
                  {column.header}
                </TableHead>
              ))}
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderTableBodyContent()}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to{' '}
            {Math.min(page * pageSize, meta.total)} of {meta.total}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {page} of {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= meta.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit/Duplicate Dialog */}
      <GenericDataDialog
        config={config}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingItem={editingItem}
        duplicatingItem={duplicatingItem}
      />
    </div>
  );
}
