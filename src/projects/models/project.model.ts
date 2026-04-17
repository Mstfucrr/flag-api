/** Domain shape for a client application (portal, partner, mobile). */
export interface Project {
  id: string;
  name: string;
  key: string;
  environments: string[];
  createdAt: Date;
  updatedAt: Date;
}
