module.exports = {
  version: "4.0",
  icon: "icon.svg",
  menu: async (kernel, info) => {
    const installed = info.exists("app/node_modules")
    const running = {
      install: info.running("install.js"),
      start: info.running("start.js"),
      update: info.running("update.js"),
      reset: info.running("reset.js")
    }

    if (running.install) {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "Instalando",
        href: "install.js"
      }]
    }

    if (!installed) {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "Instalar Codex Hub",
        href: "install.js"
      }]
    }

    if (running.start) {
      const local = info.local("start.js")
      if (local && local.url) {
        return [{
          icon: "fa-solid fa-terminal",
          text: "Servidor",
          href: "start.js"
        }, {
          default: true,
          icon: "fa-solid fa-layer-group",
          text: "Abrir Codex Hub",
          href: local.url
        }]
      }
      return [{
        default: true,
        icon: "fa-solid fa-terminal",
        text: "Iniciando servidor",
        href: "start.js"
      }]
    }

    if (running.update) {
      return [{
        default: true,
        icon: "fa-solid fa-rotate",
        text: "Atualizando",
        href: "update.js"
      }]
    }

    if (running.reset) {
      return [{
        default: true,
        icon: "fa-solid fa-broom",
        text: "Restaurando dependências",
        href: "reset.js"
      }]
    }

    return [{
      default: true,
      icon: "fa-solid fa-power-off",
      text: "Iniciar",
      href: "start.js"
    }, {
      icon: "fa-solid fa-rotate",
      text: "Atualizar",
      href: "update.js"
    }, {
      icon: "fa-solid fa-plug",
      text: "Reinstalar dependências",
      href: "install.js"
    }, {
      icon: "fa-regular fa-circle-xmark",
      text: "<div><strong>Resetar</strong><div>Remove somente as dependências locais</div></div>",
      href: "reset.js",
      confirm: "Remover as dependências do Codex Hub? O histórico do Codex não será apagado."
    }]
  }
}
