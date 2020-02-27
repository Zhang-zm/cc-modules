const { read, write, extract} = require_('utils.js');
const $gitlab = require_('gitlab.js');
const $shell = require_('node_modules/shelljs');
const $fs = require('fs');

const vm = (el) => {
  return new Vue({
    el,
    name: 'cc-modules-panel',
    template: read('panel/panel.html'),
    data () {
      return {
        gitlab: $gitlab.GITLAB,
        settingsSaved: false,
        items: [],
        branches: {},
        tags: {},
        errorMsg: ''
      }
    },
    created() {
        window.ccmodules = this;
        window.gitlab = $gitlab;
    },
    compiled() {
      if (!!localStorage.getItem('privateToken')) {
        this.clickSection('#gitlabSettings');
      }
      Object.assign($gitlab.GITLAB, this.gitlab);
      this.getProjects().then(() => {
        this.clickSection('#explaination');
      });
    },
    methods: {
      saveSettings() {
        const self = this;
        const fields = Object.keys(this.gitlab);
        const emptyField = fields.find(f => this.gitlab[f] == '');
        if (emptyField) {
          alert(`${emptyField} can not be empty!`);
          return;
        }
        fields.forEach(f => localStorage.setItem(f, this.gitlab[f]))
        this.settingsSaved = true;
        setTimeout(() => {
          self.settingsSaved = false;
          this.clickSection('#gitlabSettings');
          this.clickSection()
        }, 1000);
      },
      refresh() {
        this.getProjects();
      },
      getProjects() {
        return $gitlab.groups()
          .then(data => {
            if (data && data.projects) {
              const prefixes = this.gitlab.prefixes.split(',');
              return data.projects.filter(p => prefixes.indexOf(p.name.split('-')[0]) >= 0);
            } else {
              throw data.message;
            }
          })
          .then(all => all.map(p => {
            this.errorMsg = '';
            this.getTags(p.id, p.name);
            this.getMaster(p.id);
            return {
              name: p.name,
              desc: p.description,
              id: p.id
            };
          }))
          .then(all => this.items = all.sort((a, b) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;
            return 0;
          }))
          .catch(err => {
            this.errorMsg = err;
          });
      },
      onPropChange(e) {
        const key = e.target.dataset.key;
        this.gitlab[key] = $gitlab[key] = e.target.value;
      },
      clickSection(id) {
        this.$el.querySelector(`${id} .header`).click();
      },
      hasSettings() {
        const values = Object.values(this.gitlab);
        return values.filter(v => v != null).length === values.length;
      },
      download(e, projectId, projectName) {
        const tag = e.target.closest('li').querySelector('ui-select').value
        if (tag === 'N/A' || tag === 'unknown') {
          alert('Please select a valid tag!');
          return;
        }
        const modDir = this.gitlab.moduleDirectory;
        $gitlab.downloadArchive(projectId, tag).then(buf => {
          const srcZip = write(`cache/${projectName}-${tag}.zip`, buf);
          const destDir = Editor.url(`db://assets/${modDir}`);
          if (!$fs.existsSync(destDir)) {
            $fs.mkdirSync(destDir);
          }
          const to = `${destDir}/${projectName}`;
          if ($fs.existsSync(to)) {
            confirm(`Please delete existing module first: ${modDir}/${to}`);
            return;
          }
          let commit = this.tags[projectId].find(t => t.name === tag).commit;
          if (!commit) {
            commit = this.branches[projectId].commit;
          }
          const sha = commit.id;
          extract(srcZip, destDir).then(() => {
            const from = `${destDir}/${projectName}-${tag}-${sha}`;
            $shell.mv(from, to);
            this.refreshAssets();
            this.getProjects();
          });
        });
      },
      refreshAssets() {
        Editor.assetdb.refresh('db://assets/');
      },
      getTags(projectId, projectName) {
        return $gitlab.tags(projectId)
          .then(all => {
            const versions = all.filter(p => ({name: p.name}));
            let finalTags = [{name: 'N/A'},{name: 'unknown'}];
            let cur = this.getCurrentVersion(projectName, projectId);

            if (cur.match(/[0-9.]+/)) {
              finalTags = [];
              // [v1, v2,...,v3, master]
              cur = 'v' + cur;
              if (!versions.find(tag => tag.name === cur)) {
                finalTags.push({name: cur});
              }
              finalTags.push({name: 'master'});
              finalTags = finalTags.concat(versions);
            } else {
              // [N/a, unknown, master]
              finalTags.push({name: 'master'});
            }
            Vue.set(this.tags, projectId, finalTags);
            setTimeout(() => {
              const uiSelect = document.querySelector(`::shadow #project-tags-${projectId}`);
              // maybe v? or unknown
              uiSelect.value = cur;
            }, 0);
            
          });
      },
      getMaster(projectId) {
        return $gitlab.branches(projectId)
          .then(master => {
            Vue.set(this.branches, projectId, master);
          });
      },
      onTagChanged(e, project) {
        const tag = e.target.selectedText;
        e.target.closest('li').querySelector('a').dataset.tag = tag;
      },
      getCurrentVersion(name, projectId) {
        const url = Editor.url(`db://assets/${this.gitlab.moduleDirectory}/${name}/package.json`);
        if (!$fs.existsSync(url)) return 'N/A';
        try {
          const pkg = JSON.parse($fs.readFileSync(url).toString());
          if (pkg.version) {
            return pkg.version
          } else {
            return 'unknow';
          }
        } catch (e) {
          return 'unknow';
        }
      }
    }
  });
}

Editor.Panel.extend({
  style: read('panel/style.css'),
  template: read('panel/index.html'),
  $: {
    root: '#cc-modules-panel'
  },
  ready () {
    this.vm = vm(this.$root);
  },
  messages: {
    assetsDeleted(e) {
      this.vm.refresh();
    }
  }
});

function require_(relativePath) {
  return Editor.require(`packages://cc-modules/${relativePath}`);
}