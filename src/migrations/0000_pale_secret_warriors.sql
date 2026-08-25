CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachment" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"uploadedById" text NOT NULL,
	"filename" text NOT NULL,
	"url" text NOT NULL,
	"publicId" text NOT NULL,
	"mimeType" text NOT NULL,
	"sizeBytes" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"userId" text NOT NULL,
	"content" text NOT NULL,
	"isInternal" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module" (
	"id" serial PRIMARY KEY NOT NULL,
	"projectId" integer NOT NULL,
	"moduleName" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"ticketId" integer,
	"isRead" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" serial PRIMARY KEY NOT NULL,
	"projectName" text NOT NULL,
	"projectCode" text NOT NULL,
	"clientId" text NOT NULL,
	"managerId" text NOT NULL,
	"description" text,
	"startDate" date,
	"endDate" date,
	"status" text DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_projectCode_unique" UNIQUE("projectCode")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "ticket" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketNumber" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"clientId" text NOT NULL,
	"assignedToId" text,
	"assignedById" text,
	"projectId" integer,
	"moduleId" integer,
	"assignedAt" timestamp,
	"resolvedAt" timestamp,
	"closedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_ticketNumber_unique" UNIQUE("ticketNumber")
);

--> statement-breakpoint // temp change ()//
CREATE TABLE "tickethistory" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"userId" text NOT NULL,
	"action" text NOT NULL,
	"oldValue" text,
	"newValue" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticketId" integer NOT NULL,
	"userId" text NOT NULL,
	"description" text,
	"startTime" timestamp NOT NULL,
	"endTime" timestamp,
	"durationMinutes" integer,
	"isBillable" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'client' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module" ADD CONSTRAINT "module_projectId_project_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_clientId_user_id_fk" FOREIGN KEY ("clientId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_managerId_user_id_fk" FOREIGN KEY ("managerId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_projectId_project_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_moduleId_module_id_fk" FOREIGN KEY ("moduleId") REFERENCES "public"."module"("id") ON DELETE set null ON UPDATE no action;