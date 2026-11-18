export interface PresentationEntry {
  id: string;
  kind: 'VENUE' | 'PROJECT';
  name: string;
  logoId: string | null;
  logoUrl: string | null;
  backgroundId: string | null;
  backgroundUrl: string | null;
  instagram: string;
  version: number;
}
export interface TelevisionConfiguration {
  enabled: boolean;
  venueId: string | null;
  projectId: string | null;
  version: number;
}
