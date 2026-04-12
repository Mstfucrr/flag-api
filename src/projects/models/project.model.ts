/**
 * Domain shape for a client application (portal, partner, mobile).
 * When PostgreSQL + TypeORM are wired, replace with an `@Entity()` class
 * and keep this interface for DTO mapping if useful.
 */
export interface Project {
  id: string;
  name: string;
  key: string;
  environments: string[];
  createdAt: Date;
  updatedAt: Date;
}
