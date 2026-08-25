CREATE TABLE "branding" (
	"id" serial PRIMARY KEY NOT NULL,
	"companyId" text DEFAULT 'default' NOT NULL,
	"companyName" text DEFAULT 'SupportHub' NOT NULL,
	"logoUrl" text,
	"logoPublicId" text,
	"faviconUrl" text,
	"faviconPublicId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revision_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"revisionNumber" integer NOT NULL,
	"requestedById" text NOT NULL,
	"requestedByName" text NOT NULL,
	"requestedByRole" text NOT NULL,
	"revisionNotes" text NOT NULL,
	"priority" text,
	"attachmentIds" integer[],
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewedById" text,
	"reviewedByName" text,
	"reviewedAt" timestamp,
	"rejectionReason" text,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_wallet" (
	"id" serial PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"projectId" integer,
	"totalPurchasedHours" integer DEFAULT 0 NOT NULL,
	"reservedHours" integer DEFAULT 0 NOT NULL,
	"consumedHours" integer DEFAULT 0 NOT NULL,
	"remainingHours" integer DEFAULT 0 NOT NULL,
	"contractStartDate" date,
	"contractEndDate" date,
	"status" text DEFAULT 'inactive' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_alert" (
	"id" serial PRIMARY KEY NOT NULL,
	"walletId" integer NOT NULL,
	"alertType" text NOT NULL,
	"message" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"resolvedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "wallet_transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"walletId" integer NOT NULL,
	"transactionType" text NOT NULL,
	"hours" integer NOT NULL,
	"previousBalance" integer NOT NULL,
	"newBalance" integer NOT NULL,
	"reason" text,
	"remarks" text,
	"performedBy" text NOT NULL,
	"performedAt" timestamp DEFAULT now() NOT NULL,
	"validFrom" date,
	"validTo" date
);
--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "isOverrideTicket" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "overrideReason" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "overrideBy" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "overrideDate" timestamp;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "estimatedHours" integer;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "estimatedCompletionDate" date;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "estimateNotes" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "estimateSubmittedAt" timestamp;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "estimateApprovedAt" timestamp;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "estimateApprovedBy" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "autoApproved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "autoApprovedAt" timestamp;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "approvalDeadline" timestamp;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "additionalHoursRequested" integer;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "additionalHoursApproved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "additionalHoursApprovedBy" text;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "additionalHoursAutoApproved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "additionalHoursDeadline" timestamp;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "reservedHours" integer;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "consumedHours" integer;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "revisionCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "avatarUrl" text;--> statement-breakpoint
ALTER TABLE "revision_history" ADD CONSTRAINT "revision_history_ticketId_ticket_id_fk" FOREIGN KEY ("ticketId") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_wallet" ADD CONSTRAINT "support_wallet_clientId_user_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_wallet" ADD CONSTRAINT "support_wallet_projectId_project_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_alert" ADD CONSTRAINT "wallet_alert_walletId_support_wallet_id_fk" FOREIGN KEY ("walletId") REFERENCES "public"."support_wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transaction" ADD CONSTRAINT "wallet_transaction_walletId_support_wallet_id_fk" FOREIGN KEY ("walletId") REFERENCES "public"."support_wallet"("id") ON DELETE cascade ON UPDATE no action;