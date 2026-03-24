import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { ParsedResumeFields } from '@ghostcast/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Loader2,
  Upload,
  FileUp,
  Check,
  ChevronsUpDown,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  department: string | null;
  isActive: boolean;
}

interface ParseResumeResponse {
  data: ParsedResumeFields & { rawText?: string };
}

interface PdfResumeImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export function PdfResumeImportModal({
  open,
  onOpenChange,
}: Readonly<PdfResumeImportModalProps>) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedFields, setParsedFields] = useState<ParsedResumeFields | null>(
    null
  );
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [memberOpen, setMemberOpen] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Editable fields
  const [resume, setResume] = useState('');
  const [certification, setCertification] = useState('');
  const [training, setTraining] = useState('');
  const [education, setEducation] = useState('');

  // Fetch members
  const { data: membersResponse, isLoading: isLoadingMembers } = useQuery({
    queryKey: ['members', 'active'],
    queryFn: async () => {
      const response = await api.get<{ data: { data: Member[] } }>(
        '/members?pageSize=500&memberStatus=active'
      );
      return response.data.data;
    },
    enabled: open,
  });

  const members = membersResponse ?? [];

  const selectedMember = members.find((m) => m.id === selectedMemberId);

  // Apply mutation
  const applyMutation = useMutation({
    mutationFn: async () => {
      return api.post(`/pdf-resume-import/apply/${selectedMemberId}`, {
        resume,
        certification,
        training,
        education,
        replaceExisting,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['member', selectedMemberId] });
      toast({
        title: 'Resume imported successfully',
        description: `Profile updated for ${selectedMember?.firstName} ${selectedMember?.lastName}`,
      });
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to apply resume',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleClose = useCallback(() => {
    setSelectedFile(null);
    setParsedFields(null);
    setSelectedMemberId('');
    setReplaceExisting(true);
    setResume('');
    setCertification('');
    setTraining('');
    setEducation('');
    setParseError(null);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        if (file.type !== 'application/pdf') {
          toast({
            title: 'Invalid file type',
            description: 'Please select a PDF file',
            variant: 'destructive',
          });
          return;
        }
        setSelectedFile(file);
        setParsedFields(null);
        setParseError(null);
      }
    },
    [toast]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      setIsDragging(false);

      const file = event.dataTransfer.files?.[0];
      if (file) {
        if (file.type !== 'application/pdf') {
          toast({
            title: 'Invalid file type',
            description: 'Please select a PDF file',
            variant: 'destructive',
          });
          return;
        }
        setSelectedFile(file);
        setParsedFields(null);
        setParseError(null);
      }
    },
    [toast]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      setIsDragging(false);
    },
    []
  );

  const handleParse = useCallback(async () => {
    if (!selectedFile) return;

    setIsParsing(true);
    setParseError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch(`${API_BASE}/pdf-resume-import/parse`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${api.getToken()}`,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Parse failed' }));
        throw new Error(error.message || 'Failed to parse PDF');
      }

      const result: ParseResumeResponse = await response.json();
      setParsedFields(result.data);
      setResume(result.data.resume || '');
      setCertification(result.data.certification || '');
      setTraining(result.data.training || '');
      setEducation(result.data.education || '');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to parse PDF';
      setParseError(message);
      toast({
        title: 'Failed to parse PDF',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsParsing(false);
    }
  }, [selectedFile, toast]);

  const canApply =
    parsedFields && selectedMemberId && (resume || certification || training || education);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            Import PDF Resume
          </DialogTitle>
          <DialogDescription>
            Upload a PDF resume to extract profile information using AI, then
            apply it to a member&apos;s profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label>PDF Resume</Label>
            <label
              htmlFor="pdf-resume-upload"
              className={cn(
                'relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50',
                selectedFile && 'border-green-500 bg-green-50 dark:bg-green-950/20'
              )}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input
                id="pdf-resume-upload"
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={handleFileSelect}
              />
              {selectedFile ? (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-5 w-5 text-green-600" />
                  <span className="font-medium">{selectedFile.name}</span>
                  <span className="text-muted-foreground">
                    ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              ) : (
                <>
                  <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag and drop a PDF file, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    Maximum file size: 10MB
                  </p>
                </>
              )}
            </label>
            {selectedFile && !parsedFields && (
              <Button
                onClick={handleParse}
                disabled={isParsing}
                className="w-full"
              >
                {isParsing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Parsing with AI...
                  </>
                ) : (
                  <>
                    <FileUp className="mr-2 h-4 w-4" />
                    Parse PDF
                  </>
                )}
              </Button>
            )}
            {parseError && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {parseError}
              </div>
            )}
          </div>

          {/* Parsed Fields Preview */}
          {parsedFields && (
            <>
              <div className="border-t pt-4">
                <h4 className="mb-3 font-medium">Extracted Fields</h4>
                <p className="mb-4 text-sm text-muted-foreground">
                  Review and edit the extracted information before applying to a
                  member profile.
                </p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="resume">Resume / Work Experience</Label>
                    <Textarea
                      id="resume"
                      value={resume}
                      onChange={(e) => setResume(e.target.value)}
                      rows={4}
                      placeholder="Work experience, job history..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="certification">Certifications</Label>
                    <Textarea
                      id="certification"
                      value={certification}
                      onChange={(e) => setCertification(e.target.value)}
                      rows={3}
                      placeholder="Professional certifications..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="training">Training</Label>
                    <Textarea
                      id="training"
                      value={training}
                      onChange={(e) => setTraining(e.target.value)}
                      rows={3}
                      placeholder="Training courses, workshops..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="education">Education</Label>
                    <Textarea
                      id="education"
                      value={education}
                      onChange={(e) => setEducation(e.target.value)}
                      rows={3}
                      placeholder="Degrees, schools..."
                    />
                  </div>
                </div>
              </div>

              {/* Member Selection */}
              <div className="border-t pt-4">
                <h4 className="mb-3 font-medium">Target Member</h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select Member</Label>
                    <Popover open={memberOpen} onOpenChange={setMemberOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={memberOpen}
                          className="w-full justify-between"
                          disabled={isLoadingMembers}
                        >
                          {isLoadingMembers && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          {!isLoadingMembers && selectedMember && (
                            <span>
                              {selectedMember.firstName} {selectedMember.lastName}
                              {selectedMember.department && (
                                <span className="ml-2 text-muted-foreground">
                                  ({selectedMember.department})
                                </span>
                              )}
                            </span>
                          )}
                          {!isLoadingMembers && !selectedMember && (
                            <span className="text-muted-foreground">
                              Select a member...
                            </span>
                          )}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search members..." />
                          <CommandList>
                            <CommandEmpty>No members found.</CommandEmpty>
                            <CommandGroup>
                              {members.map((member) => (
                                <CommandItem
                                  key={member.id}
                                  value={`${member.firstName} ${member.lastName}`}
                                  onSelect={() => {
                                    setSelectedMemberId(member.id);
                                    setMemberOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      selectedMemberId === member.id
                                        ? 'opacity-100'
                                        : 'opacity-0'
                                    )}
                                  />
                                  <span>
                                    {member.firstName} {member.lastName}
                                  </span>
                                  {member.department && (
                                    <span className="ml-2 text-muted-foreground">
                                      ({member.department})
                                    </span>
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Update Mode</Label>
                    <Select
                      value={replaceExisting ? 'replace' : 'append'}
                      onValueChange={(value: string) =>
                        setReplaceExisting(value === 'replace')
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="replace">
                          Replace existing profile fields
                        </SelectItem>
                        <SelectItem value="append">
                          Append to existing profile fields
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {parsedFields && (
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={!canApply || applyMutation.isPending}
            >
              {applyMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Applying...
                </>
              ) : (
                'Apply to Member'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
