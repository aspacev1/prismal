-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "color" TEXT,
ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "ProjectMember" ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false;
