"use strict";

const base = require("./catalog");
const { PUBLICATION_COLORS, PUBLICATION_POSTS, validatePublicationPosts } = require("./publication-catalog");

const COLORS = Object.freeze({ ...base.COLORS, ...PUBLICATION_COLORS });
const POSTS = Object.freeze([...base.POSTS, ...PUBLICATION_POSTS]);

function validateExpandedCatalog() {
  validatePublicationPosts(PUBLICATION_POSTS);
  if (POSTS.length !== 33) throw new Error(`Expanded Field Manual catalog must contain 33 posts; received ${POSTS.length}`);
  const ids = new Set();
  const slugs = new Set();
  for (const post of POSTS) {
    if (ids.has(post.id)) throw new Error(`Duplicate expanded Field Manual post id: ${post.id}`);
    if (slugs.has(post.slug)) throw new Error(`Duplicate expanded Field Manual post slug: ${post.slug}`);
    if (!COLORS[post.category]) throw new Error(`Missing expanded Field Manual category color: ${post.category}`);
    ids.add(post.id);
    slugs.add(post.slug);
  }
  const slideCount = POSTS.reduce((total, post) => total + post.slides.length, 0);
  if (slideCount !== 234) throw new Error(`Expanded Field Manual catalog must contain 234 slides; received ${slideCount}`);
  return { posts: POSTS.length, slides: slideCount, categories: [...new Set(POSTS.map((post) => post.category))].sort() };
}

const EXPANDED_CATALOG_PROOF = Object.freeze(validateExpandedCatalog());

module.exports = {
  ...base,
  COLORS,
  POSTS,
  PUBLICATION_POSTS,
  EXPANDED_CATALOG_PROOF,
  validateExpandedCatalog,
};
