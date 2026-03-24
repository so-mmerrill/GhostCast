/**
 * Raw QUIP API response types.
 * Internal to the API proxy layer - not exported to shared.
 */

export interface QuipUser {
  id: string;
  name: string;
  private_folder_id: string;
  starred_folder_id: string;
  desktop_folder_id: string;
  shared_folder_ids?: string[];
}

export interface QuipFolder {
  folder: {
    id: string;
    title: string;
    created_usec: number;
    updated_usec: number;
    color: string;
  };
  children: QuipFolderChild[];
  member_ids: string[];
}

export interface QuipFolderChild {
  folder_id?: string;
  thread_id?: string;
}

export interface QuipThread {
  thread: {
    id: string;
    title: string;
    link: string;
    created_usec: number;
    updated_usec: number;
    author_id: string;
    type: 'document' | 'spreadsheet' | 'chat';
  };
  html: string;
}
