import { CanActivate, Injectable } from '@nestjs/common';

/**
 * Placeholder for admin authentication (JWT, API key, service account).
 *
 * When auth is ready, replace `canActivate` with real validation and apply on
 * {@link ProjectsController}: `@UseGuards(ProjectsAdminGuard)`.
 *
 * **Do not expose `POST /projects` publicly in production without this guard.**
 */
@Injectable()
export class ProjectsAdminGuard implements CanActivate {
  canActivate(): boolean {
    // TODO: validate admin token / role
    return true;
  }
}
