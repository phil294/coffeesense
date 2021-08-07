module.exports = {
  title: 'CoffeeSense',
  description: 'Vue tooling for VS Code.',
  base: '/coffeesense/',
  markdown: {
    linkify: true
  },
  themeConfig: {
    repo: 'phil294/coffeesense',
    editLinks: true,
    docsDir: 'docs',
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Reference', link: '/reference/' },
      { text: 'FAQ', link: '/guide/FAQ' },
      { text: 'Roadmap', link: 'https://github.com/phil294/coffeesense/issues/873' },
      { text: 'Credits', link: '/credits' },
      { text: 'Contribution Guide', link: 'https://github.com/phil294/coffeesense/wiki#contribution-guide' }
    ],
    sidebar: {
      '/guide/': [
        '',
        'setup',
        {
          title: 'Features',
          collapsable: false,
          children: [
            'highlighting',
            'semantic-highlighting',
            'snippet',
            'emmet',
            'linting-error',
            'formatting',
            'intellisense',
            'debugging',
            'component-data',
            'interpolation',
            'vti',
            'global-components'
          ]
        },
        'FAQ'
      ],
      '/reference/': ['', 'tsconfig']
    }
  }
};
