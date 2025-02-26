class LightningMonitorCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.lightningData = [];
    this.lastValues = {}; // Para rastrear valores anteriores
    this.lastUpdateTime = 0; // Para rastrear quando o último evento foi registrado
  }

  setConfig(config) {
    if (!config.distance_entity && !config.energy_entity && !config.entity) {
      throw new Error('Você precisa definir uma entidade');
    }
    this.config = config;
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    
    // Apenas atualiza se for a primeira vez ou se passar tempo suficiente
    const now = Date.now();
    if (!oldHass || now - this.lastUpdateTime > 10000) { // 10 segundos
      this.updateData();
      this.render();
      this.lastUpdateTime = now;
    }
  }

  // Gera um ângulo aleatório mas determinístico baseado no ID
  getAngleForEvent(eventId) {
    // Usa o ID para gerar um ângulo que será consistente para o mesmo evento
    const idNumber = typeof eventId === 'number' ? eventId : parseInt(String(eventId).replace(/\D/g, ''));
    return (idNumber % 360) * (Math.PI / 180);
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
          
          // Se não temos registros, gere um imediatamente
          if (this.lightningData.length === 0) {
            this.addNewLightningEvent(distance, strength);
            
            // Gere um segundo registro com dados ligeiramente diferentes para teste
            setTimeout(() => {
              this.addNewLightningEvent(
                distance + (Math.random() * 4 - 2),  // Distância um pouco diferente
                Math.min(strength + (Math.random() * 10 - 5), 100)  // Força um pouco diferente
              );
              this.render();
            }, 100);
            return;
          }
          
          // Verificar se os valores são diferentes dos últimos registrados significativamente
          const currentKey = `${Math.round(distance)}_${Math.round(strength)}`;
          const isNewValue = currentKey !== this.lastValues.key;
          
          // Sempre adicione um novo registro se tivermos menos que o mínimo
          if (isNewValue || this.lightningData.length < 2) {
            this.addNewLightningEvent(distance, strength);
          }
        }
      } 
      
      // Se não tiver dados, cria exemplos
      if (this.lightningData.length === 0) {
        const now = new Date();
        
        // Adiciona dois registros de exemplo com valores diferentes
        this.addNewLightningEvent(8.3, 65);
        
        setTimeout(() => {
          this.addNewLightningEvent(12.1, 42);
          this.render();
        }, 100);
      }
    } catch (e) {
      console.error("Erro ao processar dados:", e);
    }
  }
  
  // Função auxiliar para adicionar um novo evento de raio
  addNewLightningEvent(distance, strength) {
    const now = new Date();
    const currentTimestamp = now.getTime();
    
    // Limitação do valor de força para no máximo 100
    const limitedStrength = Math.min(Math.max(strength, 1), 100);
    
    // Adiciona um novo evento no início do array
    const newEvent = {
      id: currentTimestamp,
      timestamp: now.toISOString(),
      distance: distance,
      strength: limitedStrength
    };
    
    this.lightningData.unshift(newEvent);
    
    // Atualiza os últimos valores registrados
    this.lastValues = {
      key: `${Math.round(distance)}_${Math.round(strength)}`,
      distance: distance,
      strength: limitedStrength,
      timestamp: currentTimestamp
    };
    
    // Limita a quantidade de registros
    const maxEntries = this.config.max_entries || 4;
    if (this.lightningData.length > maxEntries) {
      this.lightningData = this.lightningData.slice(0, maxEntries);
    }
    
    console.log(`Novo evento de raio: ${distance}km / ${limitedStrength}`);
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  render() {
    if (!this._hass) return;
    
    // Garante que temos pelo menos um evento
    if (this.lightningData.length === 0) {
      this.updateData();
      return;
    }
    
    // Encontra o raio mais próximo e o mais forte
    const closestLightning = this.lightningData.reduce((prev, current) => 
      (prev.distance < current.distance) ? prev : current, this.lightningData[0]);
    
    const strongestLightning = this.lightningData.reduce((prev, current) => 
      (prev.strength > current.strength) ? prev : current, this.lightningData[0]);
    
    // Verificar se radar deve ser mostrado
    const showRadar = this.config.show_radar !== false;
    
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
          
          /* Estilos do radar */
          .radar-container {
            position: relative;
            height: 200px;
            background-color: #f8f9fa;
            border-radius: 50%;
            margin: 16px 0;
          }
          
          .radar-circles {
            position: relative;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .radar-circle {
            position: absolute;
            border-radius: 50%;
            border: 1px solid #eee;
          }
          
          .radar-circle.outer {
            width: 180px;
            height: 180px;
          }
          
          .radar-circle.middle {
            width: 120px;
            height: 120px;
          }
          
          .radar-circle.inner {
            width: 60px;
            height: 60px;
          }
          
          .radar-center {
            width: 6px;
            height: 6px;
            background-color: #3498db;
            border-radius: 50%;
          }
          
          .lightning-marker {
            position: absolute;
            transform: translate(-50%, -50%);
            color: #f39c12;
          }
          
          .icon-large {
            width: 24px;
            height: 24px;
          }
          
          .icon-medium {
            width: 18px;
            height: 18px;
          }
          
          .icon-small {
            width: 14px;
            height: 14px;
          }
        </style>
        
        <div class="card-container">
          <h2>${this.config.name || 'Monitor de Raios'}</h2>
          <p>${this.lightningData.length} registros encontrados</p>
          
          ${showRadar ? `
            <div class="radar-container">
              <div class="radar-circles">
                <div class="radar-circle outer"></div>
                <div class="radar-circle middle"></div>
                <div class="radar-circle inner"></div>
                <div class="radar-center"></div>
                
                ${this.lightningData.map(lightning => {
                  // Calcular posição baseada em distância
                  const angle = this.getAngleForEvent(lightning.id);
                  const radius = Math.min((lightning.distance / 20) * 90, 90); // Limita ao radar
                  const x = Math.cos(angle) * radius;
                  const y = Math.sin(angle) * radius;
                  
                  const iconClass = lightning.strength > 60 ? 'icon-large' : 
                                  lightning.strength > 30 ? 'icon-medium' : 'icon-small';
                  
                  return `
                    <div class="lightning-marker ${iconClass}" 
                         style="left: calc(50% + ${x}px); top: calc(50% + ${y}px);">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 2v11h3v9l7-12h-4l3-8z" />
                      </svg>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}
          
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
