/**
 * Default registry rows for AtLapse. Adding a kind or predicate is a row here
 * (or an insert at runtime), never a schema or code change.
 */

export type KindClass = 'fact' | 'person' | 'concept';

export interface KindRow {
  key: string;
  class: KindClass;
  parentKey?: string;
  label: string;
  color?: string;
  renderer?: string;
}

export const PREDICATE_FAMILIES = [
  'correlation', 'claim', 'authorship', 'membership', 'lineage',
  'classification', 'location', 'evidence', 'similarity',
] as const;
export type PredicateFamily = typeof PREDICATE_FAMILIES[number];

export interface PredicateRow {
  key: string;
  family: PredicateFamily;
  label: string;
  inverseLabel: string;
  computed?: boolean;
  attributed?: boolean;
}

const FIG = '#C46686';
const OLIVE = '#788C5D';
const SKY = '#6A9BCC';
const YELLOW = '#C9A82D';
const AQUA = '#2E9191';
const MAGENTA = '#A64D87';
const GREY = '#87867F';

export const DEFAULT_KINDS: KindRow[] = [
  // Facts
  { key: 'work', class: 'fact', label: 'Work', color: FIG },
  { key: 'source', class: 'fact', label: 'Source', color: GREY, renderer: 'link' },
  { key: 'event', class: 'fact', label: 'Event', color: YELLOW },
  { key: 'place', class: 'fact', label: 'Place', color: AQUA },
  // Persons
  { key: 'individual', class: 'person', label: 'Person', color: SKY },
  { key: 'group', class: 'person', label: 'Group', color: SKY },
  // Concepts
  { key: 'form', class: 'concept', label: 'Form', color: OLIVE },
  { key: 'current', class: 'concept', label: 'Current', color: OLIVE },
  { key: 'idea', class: 'concept', label: 'Idea', color: OLIVE },

  // Work sub-kinds
  { key: 'painting', class: 'fact', parentKey: 'work', label: 'Painting', color: FIG },
  { key: 'sculpture', class: 'fact', parentKey: 'work', label: 'Sculpture', color: FIG },
  { key: 'building', class: 'fact', parentKey: 'work', label: 'Building', color: AQUA },
  { key: 'book', class: 'fact', parentKey: 'work', label: 'Book', color: OLIVE },
  { key: 'poem', class: 'fact', parentKey: 'work', label: 'Poem', color: OLIVE },
  { key: 'album', class: 'fact', parentKey: 'work', label: 'Album', color: SKY },
  { key: 'song', class: 'fact', parentKey: 'work', label: 'Song', color: SKY },
  { key: 'composition', class: 'fact', parentKey: 'work', label: 'Composition', color: SKY },
  { key: 'film', class: 'fact', parentKey: 'work', label: 'Film', color: MAGENTA },
  { key: 'performance', class: 'fact', parentKey: 'work', label: 'Performance', color: YELLOW },

  // Source sub-kinds, each with the evidence renderer that shows it
  { key: 'news_article', class: 'fact', parentKey: 'source', label: 'News article', color: GREY, renderer: 'article' },
  { key: 'encyclopedia_article', class: 'fact', parentKey: 'source', label: 'Encyclopedia article', color: GREY, renderer: 'article' },
  { key: 'video', class: 'fact', parentKey: 'source', label: 'Video', color: GREY, renderer: 'video' },
  { key: 'social_post', class: 'fact', parentKey: 'source', label: 'Social post', color: GREY, renderer: 'post' },
  { key: 'web_link', class: 'fact', parentKey: 'source', label: 'Link', color: GREY, renderer: 'link' },
  { key: 'archive_record', class: 'fact', parentKey: 'source', label: 'Archive record', color: GREY, renderer: 'link' },

  // Event and place sub-kinds
  { key: 'historical_event', class: 'fact', parentKey: 'event', label: 'Historical event', color: YELLOW },
  { key: 'exhibition', class: 'fact', parentKey: 'event', label: 'Exhibition', color: YELLOW },
  { key: 'city', class: 'fact', parentKey: 'place', label: 'City', color: AQUA },
  { key: 'country', class: 'fact', parentKey: 'place', label: 'Country', color: AQUA },
  { key: 'venue', class: 'fact', parentKey: 'place', label: 'Venue', color: AQUA },
];

export const DEFAULT_PREDICATES: PredicateRow[] = [
  // Correlation: computed from data, never a statement of cause
  { key: 'precedes', family: 'correlation', label: 'came before', inverseLabel: 'came after', computed: true },
  { key: 'co_occurs_with', family: 'correlation', label: 'happened alongside', inverseLabel: 'happened alongside', computed: true },
  { key: 'shares_context_with', family: 'correlation', label: 'shares context with', inverseLabel: 'shares context with', computed: true },
  // Claim: always attributed to a source or a named person
  { key: 'claims_cause', family: 'claim', label: 'is said to have led to', inverseLabel: 'is said to follow from', attributed: true },
  { key: 'claims_influence', family: 'claim', label: 'is said to have influenced', inverseLabel: 'is said to be influenced by', attributed: true },
  { key: 'disputes', family: 'claim', label: 'disputes', inverseLabel: 'is disputed by', attributed: true },
  // Authorship: the role (painter, composer, author ...) is a qualifier
  { key: 'created_by', family: 'authorship', label: 'created by', inverseLabel: 'created' },
  { key: 'performed_by', family: 'authorship', label: 'performed by', inverseLabel: 'performed' },
  { key: 'commissioned_by', family: 'authorship', label: 'commissioned by', inverseLabel: 'commissioned' },
  // Membership
  { key: 'member_of', family: 'membership', label: 'member of', inverseLabel: 'has member' },
  // Lineage
  { key: 'evolved_into', family: 'lineage', label: 'evolved into', inverseLabel: 'evolved from' },
  { key: 'blends_with', family: 'lineage', label: 'blends with', inverseLabel: 'blends with' },
  { key: 'derived_from', family: 'lineage', label: 'derived from', inverseLabel: 'source of' },
  // Classification
  { key: 'instance_of', family: 'classification', label: 'belongs to', inverseLabel: 'includes' },
  { key: 'expresses', family: 'classification', label: 'expresses', inverseLabel: 'is expressed in' },
  { key: 'depicts', family: 'classification', label: 'depicts', inverseLabel: 'is depicted in' },
  // Location: the role (made, born, held, shown) is a qualifier
  { key: 'located_at', family: 'location', label: 'located at', inverseLabel: 'location of' },
  { key: 'presented_at', family: 'location', label: 'presented at', inverseLabel: 'presented' },
  // Evidence
  { key: 'documents', family: 'evidence', label: 'documents', inverseLabel: 'is documented by' },
  // Similarity
  { key: 'similar_to', family: 'similarity', label: 'is similar to', inverseLabel: 'is similar to', computed: true },
];
