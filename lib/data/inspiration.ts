export const inspirationCategories = ["Reconnect", "Readers", "Visibility"] as const;
export type InspirationCategory = (typeof inspirationCategories)[number];

export interface InspirationIdea {
  id: string;
  title: string;
  category: InspirationCategory;
  prompt: string;
  firstStep: string;
  briefTitle: string;
  briefDraft: string;
  editorialLabel: "Curated reflection";
  data_origin: "manual";
}

// Editorial questions for a person's review. These are not findings, promises
// about reader behavior, book facts, or generated creative prose.
export const inspirationIdeas: readonly InspirationIdea[] = [
  {
    id: "return-to-a-title",
    title: "The book you still think about.",
    category: "Reconnect",
    prompt: "Which published book would you love to put back in a reader’s hands, and what still draws you to it?",
    firstStep: "Choose one title and revisit its existing, approved description.",
    briefTitle: "Reintroduce a title I love",
    briefDraft: "CURATED REFLECTION · FOR MY REVIEW\n\nWhich published book would I love to put back in a reader’s hands, and what still draws me to it?\n\nTitle to consider:\nWhy I want to revisit it:\nExisting approved description or asset:\nWhat I want to verify before sharing:\n\nFirst step: choose one existing title and review its approved description.",
    editorialLabel: "Curated reflection",
    data_origin: "manual",
  },
  {
    id: "rediscover-an-asset",
    title: "Something beautiful, already yours.",
    category: "Reconnect",
    prompt: "Is there an existing cover, photograph, or approved promotional asset you would enjoy sharing again?",
    firstStep: "Find one asset you own or have permission to use, and check that its information is current.",
    briefTitle: "Revisit an approved promotional asset",
    briefDraft: "CURATED REFLECTION · FOR MY REVIEW\n\nIs there an existing cover, photograph, or approved promotional asset I would enjoy sharing again?\n\nAsset and where it lives:\nRelevant existing title:\nRights or permission to check:\nInformation that needs an update:\nPossible use for my review:\n\nFirst step: locate the original asset and confirm permission and accuracy.",
    editorialLabel: "Curated reflection",
    data_origin: "manual",
  },
  {
    id: "remember-the-milestone",
    title: "A moment worth remembering.",
    category: "Reconnect",
    prompt: "Which real moment in your author journey would you like to acknowledge, even quietly?",
    firstStep: "Find a date, photograph, or note that helps you remember it accurately.",
    briefTitle: "Acknowledge an author milestone",
    briefDraft: "CURATED REFLECTION · FOR MY REVIEW\n\nWhich real moment in my author journey would I like to acknowledge?\n\nThe moment:\nDate or source I can verify:\nWhat I would like to remember:\nWhether I want to share it or keep it private:\n\nFirst step: find the original note, image, or record. Any personal words will be my own.",
    editorialLabel: "Curated reflection",
    data_origin: "manual",
  },
  {
    id: "listen-to-readers",
    title: "A little closer to your readers.",
    category: "Readers",
    prompt: "What have readers actually said that stayed with you, and what would you like to understand better?",
    firstStep: "Choose a few real messages or reviews and keep their sources beside them.",
    briefTitle: "Listen to a few real reader voices",
    briefDraft: "CURATED REFLECTION · FOR MY REVIEW\n\nWhat have readers actually said that stayed with me? What would I like to understand better?\n\nActual messages or reviews and their sources:\nWhat I noticed:\nQuestions I still have:\nPermission needed before quoting anyone:\n\nFirst step: review a small set of real messages. A few comments are a starting point, not a claim about the whole audience.",
    editorialLabel: "Curated reflection",
    data_origin: "manual",
  },
  {
    id: "ask-one-question",
    title: "One good question.",
    category: "Readers",
    prompt: "What would you like to ask the people already reading you?",
    firstStep: "Write down the question in your own words and choose a channel you already use.",
    briefTitle: "Consider a reader conversation",
    briefDraft: "CURATED REFLECTION · FOR MY REVIEW\n\nWhat would I like to ask the people already reading me?\n\nMy question, in my words:\nWhy I want to ask:\nExisting channel to consider:\nWhen I would have time to listen and reply:\n\nFirst step: decide whether this is a conversation I want to have. Nothing is posted or sent by saving this brief.",
    editorialLabel: "Curated reflection",
    data_origin: "manual",
  },
  {
    id: "welcome-a-new-reader",
    title: "Leave the door a little wider.",
    category: "Visibility",
    prompt: "If someone discovers you today, is it clear where they can begin with your published books?",
    firstStep: "Open your public author page as a reader and check the first book link.",
    briefTitle: "Review the path for a new reader",
    briefDraft: "CURATED REFLECTION · FOR MY REVIEW\n\nIf someone discovers me today, is it clear where they can begin with my published books?\n\nPage and link checked:\nWhat is already clear:\nWhat might be confusing:\nReading order or title details to verify:\nOne improvement to consider:\n\nFirst step: follow the first book link from my public author page. Review any changes before applying them.",
    editorialLabel: "Curated reflection",
    data_origin: "manual",
  },
  {
    id: "choose-a-small-return",
    title: "A return that feels like you.",
    category: "Visibility",
    prompt: "What is one small way to show up for your existing books that would feel good this week?",
    firstStep: "Choose one manageable action and the approved material it would need.",
    briefTitle: "Choose one manageable visibility step",
    briefDraft: "CURATED REFLECTION · FOR MY REVIEW\n\nWhat is one small way to show up for my existing books that would feel good this week?\n\nAction I am considering:\nBook or existing asset involved:\nTime and energy I want to give it:\nDetails or permissions to check:\nHow I will decide whether it felt worthwhile:\n\nFirst step: choose one action that fits my week. This is an idea to review, not a scheduled task.",
    editorialLabel: "Curated reflection",
    data_origin: "manual",
  },
  {
    id: "check-the-bookshelf",
    title: "Give the bookshelf some care.",
    category: "Visibility",
    prompt: "Is there a title page, reading-order note, or purchase link you have been meaning to check?",
    firstStep: "Pick one public page and compare it with your own current records.",
    briefTitle: "Give one catalog page a careful review",
    briefDraft: "CURATED REFLECTION · FOR MY REVIEW\n\nIs there a title page, reading-order note, or purchase link I have been meaning to check?\n\nPage to review:\nAuthor-approved source to compare:\nDetails confirmed:\nDetails still uncertain:\nProposed correction, if needed:\n\nFirst step: check one page against my own current records. Unknown details stay unverified until I confirm them.",
    editorialLabel: "Curated reflection",
    data_origin: "manual",
  },
];

export function findInspirationIdea(id: string | null | undefined): InspirationIdea | undefined {
  return inspirationIdeas.find((idea) => idea.id === id);
}

export interface LiteraryQuote {
  id: string;
  text: string;
  author: string;
  work: string;
  location: string;
  sourceUrl: string;
  context: string;
  excerpt: boolean;
  verified_at: "2026-09-17";
  data_origin: "public_verified";
}

// Verified against the linked full primary texts on 2026-09-17. Excerpts end
// before the original sentence continues; no words or punctuation are rewritten.
export const literaryQuotes: readonly LiteraryQuote[] = [
  {
    id: "jane-eyre-independent-will",
    text: "I am no bird; and no net ensnares me",
    author: "Charlotte Brontë",
    work: "Jane Eyre",
    location: "Chapter XXIII",
    sourceUrl: "https://www.gutenberg.org/files/1260/1260-h/1260-h.htm",
    context: "Excerpt from Jane’s reply to Rochester as she insists on her freedom to leave and make her own choice.",
    excerpt: true,
    verified_at: "2026-09-17",
    data_origin: "public_verified",
  },
  {
    id: "wuthering-heights-souls",
    text: "Whatever our souls are made of, his and mine are the same",
    author: "Emily Brontë",
    work: "Wuthering Heights",
    location: "Chapter IX",
    sourceUrl: "https://www.gutenberg.org/files/768/768-h/768-h.htm",
    context: "Excerpt from Catherine’s conversation with Nelly about her attachment to Heathcliff and her decision to marry Edgar.",
    excerpt: true,
    verified_at: "2026-09-17",
    data_origin: "public_verified",
  },
  {
    id: "frankenstein-fearless",
    text: "Beware; for I am fearless, and therefore powerful.",
    author: "Mary Shelley",
    work: "Frankenstein",
    location: "Chapter XX · 1831 edition",
    sourceUrl: "https://www.gutenberg.org/files/42324/42324-h/42324-h.htm",
    context: "The creature addresses Victor after Victor destroys the unfinished companion. This is a character’s threat within the novel.",
    excerpt: false,
    verified_at: "2026-09-17",
    data_origin: "public_verified",
  },
];

/** Pass a server-selected date key to vary the quote; omission always returns the same opening line. */
export function getDailyQuote(dateKey?: string): LiteraryQuote {
  if (!dateKey) return literaryQuotes[0];
  let hash = 0;
  for (const character of dateKey) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return literaryQuotes[hash % literaryQuotes.length];
}
