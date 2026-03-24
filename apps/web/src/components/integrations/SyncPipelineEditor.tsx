import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SyncPipelineStep } from '@ghostcast/shared';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';

interface SyncPipelineEditorProps {
  readonly value: SyncPipelineStep[];
  readonly onChange: (steps: SyncPipelineStep[]) => void;
  readonly availableActions: { id: string; label: string }[];
  readonly disabled?: boolean;
}

export function SyncPipelineEditor({
  value,
  onChange,
  availableActions,
  disabled,
}: SyncPipelineEditorProps) {
  const usedActionIds = new Set(value.map((s) => s.actionId));

  const reorder = (steps: SyncPipelineStep[]): SyncPipelineStep[] =>
    steps.map((s, i) => ({ ...s, order: i + 1 }));

  const handleAdd = () => {
    const unused = availableActions.find((a) => !usedActionIds.has(a.id));
    if (!unused) return;
    onChange(reorder([...value, { order: value.length + 1, actionId: unused.id }]));
  };

  const handleRemove = (index: number) => {
    const next = value.filter((_, i) => i !== index);
    onChange(reorder(next));
  };

  const handleActionChange = (index: number, actionId: string) => {
    const next = value.map((s, i) => (i === index ? { ...s, actionId } : s));
    onChange(reorder(next));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const next = [...value];
    [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
    onChange(reorder(next));
  };

  const handleMoveDown = (index: number) => {
    if (index >= value.length - 1) return;
    const next = [...value];
    [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
    onChange(reorder(next));
  };

  const getActionLabel = (actionId: string) =>
    availableActions.find((a) => a.id === actionId)?.label ?? actionId;

  const sorted = [...value].sort((a, b) => a.order - b.order);
  const canAdd = usedActionIds.size < availableActions.length;

  return (
    <div className="space-y-2">
      {sorted.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((step, index) => (
                <TableRow key={step.actionId}>
                  <TableCell className="font-medium">{step.order}</TableCell>
                  <TableCell>
                    <Select
                      value={step.actionId}
                      onValueChange={(val) => handleActionChange(index, val)}
                      disabled={disabled}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>{getActionLabel(step.actionId)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {availableActions.map((action) => (
                          <SelectItem
                            key={action.id}
                            value={action.id}
                            disabled={
                              usedActionIds.has(action.id) &&
                              action.id !== step.actionId
                            }
                          >
                            {action.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleMoveUp(index)}
                        disabled={disabled || index === 0}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleMoveDown(index)}
                        disabled={disabled || index === sorted.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleRemove(index)}
                        disabled={disabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {canAdd && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={disabled}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add Step
        </Button>
      )}

      {sorted.length === 0 && !canAdd && (
        <p className="text-sm text-muted-foreground">No actions available.</p>
      )}
    </div>
  );
}
