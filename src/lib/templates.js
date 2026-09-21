// Starter routine templates. Static import, same as taxonomy.js/exercises.js
// -- never fetch() bundled data, or the file:// standalone build breaks.
import templatesData from '../data/templates.json'

export const TEMPLATES = templatesData.templates
export const TEMPLATES_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]))
