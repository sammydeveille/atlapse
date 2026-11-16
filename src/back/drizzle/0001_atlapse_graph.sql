CREATE TABLE "factbook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"visibility" varchar(16) DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factbook_visibility_check" CHECK ("factbook"."visibility" IN ('private', 'shared', 'public'))
);
--> statement-breakpoint
CREATE TABLE "factbook_member" (
	"factbook_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(16) DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factbook_member_factbook_id_user_id_pk" PRIMARY KEY("factbook_id","user_id"),
	CONSTRAINT "factbook_member_role_check" CHECK ("factbook_member"."role" IN ('viewer', 'editor'))
);
--> statement-breakpoint
CREATE TABLE "kind" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"class" varchar(16) NOT NULL,
	"parent_key" varchar(64),
	"label" varchar(120) NOT NULL,
	"color" varchar(16),
	"renderer" varchar(32),
	"attributes_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kind_class_check" CHECK ("kind"."class" IN ('fact', 'person', 'concept'))
);
--> statement-breakpoint
CREATE TABLE "node" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind_key" varchar(64) NOT NULL,
	"title" varchar(500) NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"content" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"factbook_id" uuid,
	"created_by" uuid,
	"review" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_geo" (
	"node_id" uuid PRIMARY KEY NOT NULL,
	"lon" double precision NOT NULL,
	"lat" double precision NOT NULL,
	"precision" varchar(20) DEFAULT 'approximate' NOT NULL,
	CONSTRAINT "node_geo_precision_check" CHECK ("node_geo"."precision" IN ('exact', 'approximate', 'region')),
	CONSTRAINT "node_geo_range_check" CHECK ("node_geo"."lon" BETWEEN -180 AND 180 AND "node_geo"."lat" BETWEEN -90 AND 90)
);
--> statement-breakpoint
CREATE TABLE "node_time" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"start_year" integer NOT NULL,
	"end_year" integer,
	"precision" varchar(12) DEFAULT 'year' NOT NULL,
	"start_date" date,
	"label" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "node_time_precision_check" CHECK ("node_time"."precision" IN ('millennium', 'century', 'decade', 'year', 'month', 'day')),
	CONSTRAINT "node_time_year_zero_check" CHECK ("node_time"."start_year" <> 0 AND ("node_time"."end_year" IS NULL OR "node_time"."end_year" <> 0)),
	CONSTRAINT "node_time_range_check" CHECK ("node_time"."end_year" IS NULL OR "node_time"."start_year" <= "node_time"."end_year")
);
--> statement-breakpoint
CREATE TABLE "predicate" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"family" varchar(32) NOT NULL,
	"label" varchar(120) NOT NULL,
	"inverse_label" varchar(120) NOT NULL,
	"computed" boolean DEFAULT false NOT NULL,
	"attributed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "predicate_family_check" CHECK ("predicate"."family" IN ('correlation', 'claim', 'authorship', 'membership', 'lineage', 'classification', 'location', 'evidence', 'similarity'))
);
--> statement-breakpoint
CREATE TABLE "statement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"predicate_key" varchar(64) NOT NULL,
	"object_id" uuid,
	"object_statement_id" uuid,
	"qualifiers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"status" varchar(16) DEFAULT 'proposed' NOT NULL,
	"attributed_to_id" uuid,
	"factbook_id" uuid,
	"created_by" uuid,
	"review" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "statement_one_object_check" CHECK (("statement"."object_id" IS NOT NULL) <> ("statement"."object_statement_id" IS NOT NULL)),
	CONSTRAINT "statement_status_check" CHECK ("statement"."status" IN ('computed', 'proposed', 'accepted', 'disputed')),
	CONSTRAINT "statement_confidence_check" CHECK ("statement"."confidence" >= 0 AND "statement"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "statement_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid NOT NULL,
	"source_node_id" uuid NOT NULL,
	"relevance" varchar(20) DEFAULT 'supporting' NOT NULL,
	"excerpt" text,
	"locator" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "statement_evidence_relevance_check" CHECK ("statement_evidence"."relevance" IN ('primary', 'supporting', 'contextual'))
);
--> statement-breakpoint
ALTER TABLE "factbook" ADD CONSTRAINT "factbook_owner_id_user_profile_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factbook_member" ADD CONSTRAINT "factbook_member_factbook_id_factbook_id_fk" FOREIGN KEY ("factbook_id") REFERENCES "public"."factbook"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factbook_member" ADD CONSTRAINT "factbook_member_user_id_user_profile_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kind" ADD CONSTRAINT "kind_parent_key_kind_key_fk" FOREIGN KEY ("parent_key") REFERENCES "public"."kind"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_kind_key_kind_key_fk" FOREIGN KEY ("kind_key") REFERENCES "public"."kind"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_factbook_id_factbook_id_fk" FOREIGN KEY ("factbook_id") REFERENCES "public"."factbook"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_created_by_user_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_geo" ADD CONSTRAINT "node_geo_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_time" ADD CONSTRAINT "node_time_node_id_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement" ADD CONSTRAINT "statement_subject_id_node_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement" ADD CONSTRAINT "statement_predicate_key_predicate_key_fk" FOREIGN KEY ("predicate_key") REFERENCES "public"."predicate"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement" ADD CONSTRAINT "statement_object_id_node_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement" ADD CONSTRAINT "statement_object_statement_id_statement_id_fk" FOREIGN KEY ("object_statement_id") REFERENCES "public"."statement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement" ADD CONSTRAINT "statement_attributed_to_id_node_id_fk" FOREIGN KEY ("attributed_to_id") REFERENCES "public"."node"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement" ADD CONSTRAINT "statement_factbook_id_factbook_id_fk" FOREIGN KEY ("factbook_id") REFERENCES "public"."factbook"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement" ADD CONSTRAINT "statement_created_by_user_profile_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_evidence" ADD CONSTRAINT "statement_evidence_statement_id_statement_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."statement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_evidence" ADD CONSTRAINT "statement_evidence_source_node_id_node_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_factbook_owner" ON "factbook" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_kind_parent" ON "kind" USING btree ("parent_key");--> statement-breakpoint
CREATE INDEX "idx_node_kind" ON "node" USING btree ("kind_key");--> statement-breakpoint
CREATE INDEX "idx_node_factbook" ON "node" USING btree ("factbook_id");--> statement-breakpoint
CREATE INDEX "idx_node_time_node" ON "node_time" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "idx_node_time_start" ON "node_time" USING btree ("start_year");--> statement-breakpoint
CREATE INDEX "idx_statement_subject" ON "statement" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "idx_statement_object" ON "statement" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "idx_statement_predicate" ON "statement" USING btree ("predicate_key");--> statement-breakpoint
CREATE INDEX "idx_statement_factbook" ON "statement" USING btree ("factbook_id");--> statement-breakpoint
CREATE INDEX "idx_statement_evidence_statement" ON "statement_evidence" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "idx_statement_evidence_source" ON "statement_evidence" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX idx_node_fts ON node USING GIN (to_tsvector('english', title || ' ' || summary || ' ' || COALESCE(content, '')));
--> statement-breakpoint
CREATE INDEX idx_node_tags ON node USING GIN (tags);
