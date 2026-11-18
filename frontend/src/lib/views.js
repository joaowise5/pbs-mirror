// `group` puts a view under that heading in the sidebar; null views are reached another way.
// `mockOnly` views are hidden in api mode. Team FAQ is built from the sample knowledge base; until the
// team decides whether to drop it or turn it into a list of crawled help articles, api mode hides it.
export const VIEWS = {
  assistant: { label: 'Help Assistant', icon: 'chat', group: null },
  faq: { label: 'Team FAQ', icon: 'book', group: 'resources', mockOnly: true },
  sources: { label: 'Knowledge sources', icon: 'database', group: 'resources' },
  handbook: { label: 'Staff handbook', icon: 'file', group: 'resources' },
  escalation: { label: 'Escalation directory', icon: 'users', group: 'resources' },
  feedback: { label: 'Share feedback', icon: 'message', group: null, eyebrow: 'Workspace' },
};

export const GROUP_LABELS = { resources: 'Resources' };
