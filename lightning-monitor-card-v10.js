class LightningMonitorCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.lightningData = [];
    this.lastValues = {}; // Para rastrear valores anteriores
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
          
          // Verificar se os valores são diferentes dos últimos registrados
          const currentKey = `${distance}_${strength}`;
          const isNewValue = currentKey !== this.lastValues.key;
          
          if (isNewValue) {
            // Limitação do valor de força para no máximo 100
            const limitedStrength = Math.min(strength, 100);
            
            // Adiciona um novo evento no início do array (não no final)
            this.lightningData.unshift({
              id: Date.now(),
              timestamp: new Date().toISOString(),
              distance: distance,
              strength: limitedStrength
            });
            
            // Atualiza os últimos valores registrados
            this.lastValues = {
              key: currentKey,
              distance: distance,
              strength: limitedStrength
            };
            
            // Limita a quantidade de registros
            const maxEntries = this.config.max_entries || 4;
            if (this.lightningData.length > maxEntries) {
              this.lightningData = this.lightningData.slice(0, maxEntries);
            }
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
        <style>
          .card-container {
            padding: 16px;
          }
          
          h2 {
            margin-top: 0;
            margin-bottom: 8px;
          }
          
          .metrics-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin: 16px 0;
          }
          
          .metric-card {
            padding: 12px;
            border-radius: 8px;
          }
          
          .metric-card.closest {
            background: #e3f2fd;
          }
          
          .metric-card.strongest {
            background: #fff8e1;
          }
          
          .metric-label {
            font-size: 0.85rem;
            color: #444;
          }
          
          .metric-value {
            font-size: 1.4rem;
            font-weight: bold;
          }
          
          .metric-time {
            font-size: 0.75rem;
            color: #666;
          }
          
          .events-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          
          .event-item {
            display: flex;
            padding: 8px;
            background: #f5f5f5;
            border-radius: 8px;
          }
          
          .event-details {
            flex: 1;
          }
          
          .event-header {
            display: flex;
            justify-content: space-between;
          }
          
          .event-distance {
            font-weight: 500;
          }
          
          .event-time {
            font-size: 0.8rem;
            color: #666;
          }
          
          .strength-bar {
            height: 4px;
            background: #eee;
            border-radius: 2px;
            margin-top: 4px;
            overflow: hidden;
          }
          
          .strength-level {
            height: 100%;
            background: #f39c12;
            border-radius: 2px;
          }
        </style>
        
        <div class="card-container">
          <h2>${this.config.name || 'Monitor de Raios'}</h2>
          <p>${this.lightningData.length} registros encontrados</p>
          
          <div class="metrics-container">
            <div class="metric-card closest">
              <div class="metric-label">Raio mais próximo</div>
              <div class="metric-value">${closestLightning.distance.toFixed(1)} km</div>
              <div class="metric-time">${this.formatTime(closestLightning.timestamp)}</div>
            </div>
            
            <div class="metric-card strongest">
              <div class="metric-label">Raio mais forte</div>
              <div class="metric-value">${strongestLightning.strength}</div>
              <div class="metric-time">${this.formatTime(strongestLightning.timestamp)}</div>
            </div>
          </div>
          
          <h3>Registros Recentes</h3>
          <div class="events-list">
            ${this.lightningData.map(lightning => `
              <div class="event-item">
                <div class="event-details">
                  <div class="event-header">
                    <span class="event-distance">${lightning.distance.toFixed(1)} km</span>
                    <span class="event-time">${this.formatTime(lightning.timestamp)}</span>
                  </div>
                  <div class="strength-bar">
                    <div class="strength-level" style="width: ${lightning.strength}%;"></div>
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
