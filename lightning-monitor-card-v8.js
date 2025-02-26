class LightningTestCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    this.config = config;
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <ha-card>
        <div style="padding: 16px;">
          <h2>Lightning Test Card</h2>
          <p>Este é um teste de card de raios</p>
        </div>
      </ha-card>
    `;
  }
}

customElements.define('lightning-test-card', LightningTestCard);

// Registrar o card no HACS
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'lightning-test-card',
  name: 'Lightning Test Card',
  description: 'Teste de card de raios',
});
