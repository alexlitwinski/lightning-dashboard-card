class LightningMonitorCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.lightningData = [];
    this.lastValues = {}; // Para rastrear valores anteriores
    this.lastUpdateTime = 0; // Para rastrear quando o último evento foi registrado
    this.initialized = false;
    this.demo_mode = false; // Flag para controlar o modo de demonstração
    this.lastState = null; // Para rastrear o último estado das entidades
  }

  setConfig(config) {
    if (!config.distance_entity && !config.energy_entity && !config.entity) {
      throw new Error('Você precisa definir uma entidade');
    }
    
    // Adicionar opção para ativar ou desativar o modo de demonstração
    this.demo_mode = config.demo_mode === true;
    this.config = config;
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    
    // Inicializar na primeira vez
    if (!this.initialized && this._hass) {
      this.initialized = true;
      
      // Só inicializa dados de demonstração se o modo estiver ativado
      if (this.demo_mode) {
        this.initializeDemoData();
      }
    }
    
    // Sempre tenta atualizar os dados quando o hass muda
    this.updateData();
    this.render();
  }
  
  // Inicializa os dados de demonstração apenas quando solicitado
  initializeDemoData() {
    console.log("Inicializando dados de demonstração");
    
    // Limpa dados anteriores
    this.lightningData = [];
    
    // Determina quantos registros devem ser exibidos
    const maxEntries = this.config.max_entries || 4;
    
    const now = new Date();
    
    // Dados base para os exemplos
    const baseDistance = 15.0;
    const baseStrength = 50;
    
    // Cria o número correto de exemplos
    for (let i = 0; i < maxEntries; i++) {
      // Gera uma pequena variação para cada exemplo
      const timeOffset = i * 300000; // 5 minutos entre cada exemplo
      const distanceVariation = (Math.random() * 10) - 5; // +/- 5km
      const strengthVariation = (Math.random() * 30) - 15; // +/- 15 unidades
      
      this.lightningData.push({
        id: now.getTime() - timeOffset,
        timestamp: new Date(now.getTime() - timeOffset).toISOString(),
        distance: baseDistance + distanceVariation,
        strength: Math.min(Math.max(baseStrength + strengthVariation, 1), 100)
      });
    }
    
    console.log(`DEMO: ${this.lightningData.length} registros criados`);
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
      // Verifica se as entidades de distância e energia existem
      if (this.config.distance_entity && this.config.energy_entity) {
        const distanceEntity = this.config.distance_entity;
        const energyEntity = this.config.energy_entity;
        
        const distanceObj = this._hass.states[distanceEntity];
        const energyObj = this._hass.states[energyEntity];
        
        if (distanceObj && energyObj) {
          const distance = parseFloat(distanceObj.state);
          const strength = parseFloat(energyObj.state);
          
          // Verificar se são números válidos
          if (!isNaN(distance) && !isNaN(strength)) {
            // Gera um identificador único para o estado atual das duas entidades
            const currentState = {
              distance: distance,
              strength: strength,
              lastUpdate: distanceObj.last_updated || energyObj.last_updated || new Date().toISOString()
            };
            
            // Compara se o estado atual é diferente do último estado registrado
            const isDifferentState = 
              !this.lastState || 
              Math.abs(currentState.distance - this.lastState.distance) > 0.1 || 
              Math.abs(currentState.strength - this.lastState.strength) > 0.1;
            
            // Se o estado for diferente, adiciona um novo evento
            if (isDifferentState) {
              console.log(`Novo estado detectado: ${distance}km / ${strength}`);
              
              // Adiciona o novo evento apenas se a distância for um valor razoável (não 0 ou valor negativo)
              if (distance > 0) {
                const now = new Date();
                
                // Adiciona o evento ao início do array
                this.lightningData.unshift({
                  id: now.getTime(),
                  timestamp: now.toISOString(),
                  distance: distance,
                  strength: Math.min(Math.max(strength, 1), 100)
                });
                
                // Atualiza o último estado
                this.lastState = currentState;
                
                // Limita a quantidade de registros
                const maxEntries = this.config.max_entries || 4;
                if (this.lightningData.length > maxEntries) {
                  this.lightningData = this.lightningData.slice(0, maxEntries);
                }
                
                console.log(`Registrado novo evento de raio: ${distance}km / ${strength}`);
              }
            }
          }
        }
      }
      
      // Verifica se já temos dados ou se devemos usar o modo de demonstração
      if (this.lightningData.length === 0 && this.demo_mode) {
        console.log("Nenhum dado encontrado, usando modo de demonstração");
        this.initializeDemoData();
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
    
    // Verificar se temos dados
    const hasData = this.lightningData.length > 0;
    
    // Verificar se radar deve ser mostrado
    const showRadar = this.config.show_radar !== false;
    
    // Obter valores extremos apenas se temos dados
    let closestLightning = null;
    let strongestLightning = null;
    
    if (hasData) {
      closestLightning = this.lightningData.reduce((prev, current) => 
        (prev.distance < current.distance) ? prev : current, this.lightningData[0]);
      
      strongestLightning = this.lightningData.reduce((prev, current) => 
        (prev.strength > current.strength) ? prev : current, this.lightningData[0]);
    }
    
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
          
          .no-data-message {
            text-align: center;
            padding: 20px;
            background: #f5f5f5;
            border-radius: 8px;
            margin: 16px 0;
          }
          
          .demo-badge {
            display: inline-block;
            padding: 3px 8px;
            background: #ff9800;
            color: white;
            border-radius: 12px;
            font-size: 0.7rem;
            margin-left: 8px;
            vertical-align: middle;
          }
        </style>
        
        <div class="card-container">
          <h2>
            ${this.config.name || 'Monitor de Raios'}
            ${this.demo_mode ? '<span class="demo-badge">DEMO</span>' : ''}
          </h2>
          
          ${hasData ? `<p>${this.lightningData.length} registros encontrados</p>` : ''}
          
          ${!hasData ? `
            <div class="no-data-message">
              <p>Nenhum dado de raio encontrado.</p>
              <p>Verifique se as entidades estão configuradas corretamente.</p>
              <p>Para testar o visual do componente, ative o modo de demonstração nas configurações.</p>
            </div>
          ` : ''}
          
          ${hasData && showRadar ? `
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
          
          ${hasData ? `
            <div class="metrics-container">
              <div class="metric-card closest">
                <div class="metric-label">Raio mais próximo</div>
                <div class="metric-value">${closestLightning.distance.toFixed(1)} km</div>
                <div class="metric-time">${this.formatTime(closestLightning.timestamp)}</div>
              </div>
              
              <div class="metric-card strongest">
                <div class="metric-label">Raio mais forte</div>
                <div class="metric-value">${strongestLightning.strength.toFixed(1)}</div>
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
          ` : ''}
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
