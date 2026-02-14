-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" BIGSERIAL NOT NULL,
    "workflow_id" BIGINT NOT NULL,
    "step_id" TEXT NOT NULL,
    "name" TEXT,
    "agent_id" TEXT NOT NULL,
    "input_template" TEXT NOT NULL,
    "expects" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'single',
    "loop_config" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflow_steps_workflow_id_idx" ON "workflow_steps"("workflow_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_workflow_id_step_id_key" ON "workflow_steps"("workflow_id", "step_id");

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
