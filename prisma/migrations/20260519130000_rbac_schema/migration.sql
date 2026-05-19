-- RBAC schema: Role, Permission, RolePermission
-- User.role (string) stays the canonical role identifier for now;
-- it maps 1:1 to Role.name. A future migration may convert it to an FK.

CREATE TABLE "Role" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "isSystem"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Role_name_key" ON "Role" ("name");

CREATE TABLE "Permission" (
  "id"        TEXT NOT NULL,
  "resource"  TEXT NOT NULL,
  "action"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Permission_resource_action_key" ON "Permission" ("resource", "action");

CREATE TABLE "RolePermission" (
  "id"           TEXT NOT NULL,
  "roleId"       TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "scopeRule"    JSONB NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission" ("roleId", "permissionId");
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission" ("roleId");

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
