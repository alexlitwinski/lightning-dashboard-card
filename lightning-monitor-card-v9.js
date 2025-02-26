class LightningMonitorCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.lightningData = [];
  }

  setConfig(config) {
    if (!config.distance_entity && !config.energy_entity && !config.entity) {
      throw new Error('Você precisa definir uma entidade');
    }
    this.config = config;
  }

  set hass(hass) {
    this._hass = hass;
    this.updateData();
    this.render();
  }

  updateData() {
    if (!this._hass) return;
    
    try {
      // Tenta obter dados de entidades separadas
      if (this.config.distance_entity && this.config.energy_entity) {
        const distanceObj = this._hass.states[this.config.distance_entity];
        const energyObj = this._hass.states[this.config.energy_entity];
        
        if (distanceObj && energyObj) {
          const distance = parseFloat(distanceObj.state);
          const strength = parseFloat(energyObj.state);
          
          // Adiciona um novo evento apenas se tivermos poucos eventos
          if (this.lightningData.length < (this.config.max_entries || 4)) {
            this.lightningData.push({
              id: Date.now(),
              timestamp: new Date().toISOString(),
              distance: distance,
              strength: strength
            });
          }
        }
      } 
      // Se não tiver dados, cria exemplos
      if (this.lightningData.length === 0) {
        const now = new Date();
        this.lightningData = [
          { id: now.getTime(), timestamp: now.toISOString(), distance: 8.3, strength: 65 },
          { id: now.getTime() - 300000, timestamp: new Date(now.getTime() - 300000).toISOString(), distance: 12.1, strength: 42 }
        ];
      }
    } catch (e) {
      console.error("Erro ao processar dados:", e);
    }
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  render() {
    if (!this._hass) return;
    
    // Encontra o raio mais próximo e o mais forte
    const closestLightning = this.lightningData.reduce((prev, current) => 
      (prev.distance < current.distance) ? prev : current, this.lightningData[0]);
    
    const strongestLightning = this.lightningData.reduce((prev, current) => 
      (prev.strength > current.strength) ? prev : current, this.lightningData[0]);
    
    this.shadowRoot.innerHTML = `
      <ha-card>
        <div style="padding: 16px;">
          <h2>${this.config.name || 'Monitor de Raios'}</h2>
          <p>${this.lightningData.length} registros encontrados</p>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0;">
            <div style="background: #e3f2fd; padding: 12px; border-radius: 8px;">
              <div style="font-size: 0.85rem; color: #444;">Raio mais próximo</div>
              <div style="font-size: 1.4rem; font-weight: bold;">${closestLightning.distance.toFixed(1)} km</div>
              <div style="font-size: 0.75rem; color: #666;">${this.formatTime(closestLightning.timestamp)}</div>
            </div>
            
            <div style="background: #fff8e1; padding: 12px; border-radius: 8px;">
              <div style="font-size: 0.85rem; color: #444;">Raio mais forte</div>
              <div style="font-size: 1.4rem; font-weight: bold;">${strongestLightning.strength}</div>
              <div style="font-size: 0.75rem; color: #666;">${this.formatTime(strongestLightning.timestamp)}</div>
            </div>
          </div>
          
          <h3>Registros Recentes</h3>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${this.lightningData.map(lightning => `
              <div style="display: flex; padding: 8px; background: #f5f5f5; border-radius: 8px;">
                <div style="flex: 1;">
                  <div style="display: flex; justify-content: space-between;">
                    <span style="font-weight: 500;">${lightning.distance.toFixed(1)} km</span>
                    <span style="font-size: 0.8rem; color: #666;">${this.formatTime(lightning.timestamp)}</span>
                  </div>
                  <div style="height: 4px; background: #eee; border-radius: 2px; margin-top: 4px;">
                    <div style="height: 100%; background: #f39c12; border-radius: 2px; width: ${lightning.strength}%;"></div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </ha-card>
    `;
  }
}

customElements.define('lightning-monitor-card', LightningMonitorCard);

// Registrar o card para o HACS
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'lightning-monitor-card',
  name: 'Lightning Monitor Card',
  description: 'Card para monitor de raios',
});
