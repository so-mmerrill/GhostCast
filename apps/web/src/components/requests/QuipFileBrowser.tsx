import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  QuipBrowseResponse,
  QuipBrowserItem,
  QuipParsedRequestFields,
  QuipConfigStatus,
} from '@ghostcast/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Folder,
  FileText,
  ChevronRight,
  ArrowLeft,
  Import,
  AlertCircle,
  Sparkles,
  Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface QuipFileBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (fields: QuipParsedRequestFields) => void;
}

interface BreadcrumbEntry {
  id: string;
  title: string;
}

function FileListContent({
  isBrowsing,
  browseError,
  sortedItems,
  searchQuery,
  selectedItem,
  navigateToFolder,
  setSelectedItem,
}: Readonly<{
  isBrowsing: boolean;
  browseError: Error | null;
  sortedItems: QuipBrowserItem[];
  searchQuery: string;
  selectedItem: QuipBrowserItem | null;
  navigateToFolder: (item: QuipBrowserItem) => void;
  setSelectedItem: (item: QuipBrowserItem | null) => void;
}>) {
  if (isBrowsing) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (browseError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <p className="text-sm text-destructive font-medium">
          {browseError instanceof Error ? browseError.message : 'Failed to load folders'}
        </p>
      </div>
    );
  }

  if (sortedItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {searchQuery ? 'No matching documents found' : 'This folder is empty'}
      </div>
    );
  }

  return (
    <div className="divide-y">
      {sortedItems.map((item) => (
        <button
          key={item.id}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors ${
            selectedItem?.id === item.id ? 'bg-muted' : ''
          }`}
          onClick={() => {
            if (item.type === 'folder') {
              navigateToFolder(item);
            } else {
              setSelectedItem(selectedItem?.id === item.id ? null : item);
            }
          }}
          onDoubleClick={() => {
            if (item.type === 'folder') {
              navigateToFolder(item);
            }
          }}
        >
          {item.type === 'folder' ? (
            <Folder className="h-4 w-4 text-blue-500 shrink-0" />
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="truncate flex-1">{item.title}</span>
          {item.type === 'folder' && (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>
      ))}
    </div>
  );
}

export function QuipFileBrowser({
  open,
  onOpenChange,
  onImport,
}: Readonly<QuipFileBrowserProps>) {
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(
    undefined,
  );
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([]);
  const [selectedItem, setSelectedItem] = useState<QuipBrowserItem | null>(
    null,
  );
  const [isImporting, setIsImporting] = useState(false);
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch Quip status including AI availability
  const { data: quipStatus } = useQuery<QuipConfigStatus>({
    queryKey: ['quip-status'],
    queryFn: async () => {
      const response = await api.get<{ data: QuipConfigStatus }>('/quip/status');
      return response.data;
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const isAiEnabled = quipStatus?.aiEnabled ?? false;

  // Fetch current folder contents
  const { data: browseData, isLoading: isBrowsing, error: browseError } = useQuery<QuipBrowseResponse>({
    queryKey: ['quip-browse', currentFolderId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (currentFolderId) params.folderId = currentFolderId;
      const response = await api.get<{ data: QuipBrowseResponse }>('/quip/browse', params);
      return response.data;
    },
    enabled: open,
    retry: false,
  });

  const navigateToFolder = useCallback((item: QuipBrowserItem) => {
    setBreadcrumbs((prev) => [...prev, { id: item.id, title: item.title }]);
    setCurrentFolderId(item.id);
    setSelectedItem(null);
    setSearchQuery('');
  }, []);

  const navigateBack = useCallback(() => {
    setBreadcrumbs((prev) => {
      const newBreadcrumbs = prev.slice(0, -1);
      const parentId = newBreadcrumbs.at(-1)?.id;
      setCurrentFolderId(parentId);
      return newBreadcrumbs;
    });
    setSelectedItem(null);
    setSearchQuery('');
  }, []);

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      if (index < 0) {
        setBreadcrumbs([]);
        setCurrentFolderId(undefined);
      } else {
        const target = breadcrumbs[index];
        setBreadcrumbs((prev) => prev.slice(0, index + 1));
        setCurrentFolderId(target.id);
      }
      setSelectedItem(null);
      setSearchQuery('');
    },
    [breadcrumbs],
  );

  const handleImport = useCallback(async () => {
    if (selectedItem?.type !== 'document') return;

    setIsImporting(true);
    try {
      const response = await api.get<{ data: QuipParsedRequestFields }>(
        `/quip/parse/${selectedItem.id}`,
      );
      onImport(response.data);
      onOpenChange(false);
      // Reset state
      setCurrentFolderId(undefined);
      setBreadcrumbs([]);
      setSelectedItem(null);
    } catch (error) {
      console.error('Failed to parse QUIP document:', error);
    } finally {
      setIsImporting(false);
    }
  }, [selectedItem, onImport, onOpenChange]);

  const handleAiImport = useCallback(async () => {
    if (!selectedItem?.type || selectedItem.type !== 'document') return;

    setIsAiParsing(true);
    try {
      const response = await api.get<{ data: QuipParsedRequestFields }>(
        `/quip/ai-parse/${selectedItem.id}`,
      );
      onImport(response.data);
      onOpenChange(false);
      setCurrentFolderId(undefined);
      setBreadcrumbs([]);
      setSelectedItem(null);
    } catch (error) {
      console.error('Failed to AI-parse QUIP document:', error);
    } finally {
      setIsAiParsing(false);
    }
  }, [selectedItem, onImport, onOpenChange]);

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setCurrentFolderId(undefined);
        setBreadcrumbs([]);
        setSelectedItem(null);
        setSearchQuery('');
      }
      onOpenChange(isOpen);
    },
    [onOpenChange],
  );

  const items = browseData?.items ?? [];

  // Filter items based on search query
  const filteredItems = searchQuery
    ? items.filter((item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : items;

  // Sort folders first, then documents, both alphabetically
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (a.type === b.type) return a.title.localeCompare(b.title);
    return a.type === 'folder' ? -1 : 1;
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import from Quip</DialogTitle>
        </DialogHeader>

        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground px-1 min-h-[28px]">
          {breadcrumbs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={navigateBack}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          <button
            className="hover:text-foreground transition-colors"
            onClick={() => navigateToBreadcrumb(-1)}
          >
            Quip
          </button>
          {breadcrumbs.map((bc, i) => (
            <span key={bc.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <button
                className="hover:text-foreground transition-colors truncate max-w-[120px]"
                onClick={() => navigateToBreadcrumb(i)}
              >
                {bc.title}
              </button>
            </span>
          ))}
        </div>

        {/* Search box */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto border rounded-md min-h-[300px]">
          <FileListContent
            isBrowsing={isBrowsing}
            browseError={browseError}
            sortedItems={sortedItems}
            searchQuery={searchQuery}
            selectedItem={selectedItem}
            navigateToFolder={navigateToFolder}
            setSelectedItem={setSelectedItem}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          {isAiEnabled && (
            <Button
              variant="outline"
              onClick={handleAiImport}
              disabled={
                selectedItem?.type !== 'document' || isAiParsing || isImporting
              }
            >
              {isAiParsing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              AI Import
            </Button>
          )}
          <Button
            onClick={handleImport}
            disabled={
              selectedItem?.type !== 'document' || isImporting || isAiParsing
            }
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Import className="h-4 w-4 mr-2" />
            )}
            Import Document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
