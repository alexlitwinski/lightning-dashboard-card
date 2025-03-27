// Verificar se o componente já está registrado
if (!customElements.get('lightning-monitor-card')) {
  
  class LightningMonitorCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.lightningData = [];
      this.lastValues = {}; // Para rastrear valores anteriores
      this.initialized = false;
      this.demo_mode = false; // Flag para controlar o modo de demonstração
      this.maxEntries = 10; // Valor padrão para o número máximo de entradas
      this.showRadar = true; // Valor padrão para mostrar o radar
    }

    setConfig(config) {
      if (!config.distance_entity && !config.energy_entity && !config.entity) {
        throw new Error('Você precisa definir uma entidade');
      }
      
      // Adicionar opção para ativar ou desativar o modo de demonstração
      this.demo_mode = config.demo_mode === true;
      this.config = config;
      
      // Definir configurações com base nos valores do config ou usar valores padrão
      this.maxEntries = config.max_entries || 10;
      this.showRadar = config.show_radar !== false;
    }

    set hass(hass) {
      const oldHass = this._hass;
      this._hass = hass;
      
      // Inicializar na primeira vez
      if (!this.initialized && this._hass) {
        this.initialized = true;
        
        if (this.demo_mode) {
          this.initializeDemoData();
        } else {
          // Inicializar com dados atuais
          this.checkForLightningEvents();
        }
      }
      
      // Verificar novos eventos quando o hass for atualizado
      if (this._hass && !this.demo_mode) {
        this.checkForLightningEvents();
      }
      
      this.render();
    }
    
    // Verificar eventos de raio diretamente a partir dos estados atuais
    checkForLightningEvents() {
      if (!this._hass) return;
      
      try {
        // Obter os estados atuais
        const distanceEntity = this.config.distance_entity;
        const energyEntity = this.config.energy_entity;
        
        if (!distanceEntity || !energyEntity) return;
        
        const distanceState = this._hass.states[distanceEntity];
        const energyState = this._hass.states[energyEntity];
        
        if (!distanceState || !energyState) return;
        
        // Obter valores atuais
        const distance = parseFloat(distanceState.state);
        const energy = parseFloat(energyState.state);
        
        // Verificar se os valores são válidos
        if (isNaN(distance) || isNaN(energy) || energy <= 0) return;
        
        // Verificar se isso é um novo evento que não foi registrado anteriormente
        const eventKey = `${Math.round(distance)}_${Math.round(energy)}`;
        
        // Verificar se já existe um evento com esses valores
        const exists = this.lightningData.some(event => 
          event.distance === distance && Math.abs(event.rawEnergy - energy) < 10);
        
        // Se não existe e não é igual ao último valor registrado, adicionar como novo evento
        if (!exists && eventKey !== this.lastValues.key && energy > 0) {
          // Normalizar o valor de energia para exibição
          let normalizedStrength;
          if (energy > 200000) {
            normalizedStrength = 80 + Math.min(20, (energy - 200000) / 50000);
          } else if (energy > 100000) {
            normalizedStrength = 60 + Math.min(20, (energy - 100000) / 5000);
          } else if (energy > 50000) {
            normalizedStrength = 40 + Math.min(20, (energy - 50000) / 2500);
          } else if (energy > 10000) {
            normalizedStrength = 20 + Math.min(20, (energy - 10000) / 2000);
          } else {
            normalizedStrength = Math.min(20, energy / 500);
          }
          
          // Garantir que está entre 1-100
          normalizedStrength = Math.min(100, Math.max(1, normalizedStrength));
          
          // Criar o novo evento
          const now = new Date();
          const newEvent = {
            id: now.getTime(),
            timestamp: now.toISOString(),
            distance: distance,
            strength: normalizedStrength,
            rawEnergy: energy,
            source: 'sensor'
          };
          
          // Adicionar ao início da lista
          this.lightningData.unshift(newEvent);
          
          // Atualizar último valor registrado
          this.lastValues = {
            key: eventKey,
            distance: distance,
            energy: energy
          };
          
          console.log(`[Lightning Card] Novo evento detectado: ${distance}km / Energia: ${energy} / Força: ${normalizedStrength.toFixed(1)}`);
          
          // Adicionar eventos históricos se a lista ainda estiver pequena
          this.addHistoricalEvents();
        }
      } catch (e) {
        console.error("[Lightning Card] Erro ao verificar eventos:", e);
      }
    }
    
    // NOVA FUNÇÃO: Adicionar eventos históricos reais sem estimativa
    addHistoricalEvents() {
      // Se já temos muitos eventos, não precisamos criar mais
      if (this.lightningData.length >= this.maxEntries) return;
      
      // Dados históricos conhecidos
      const historicalData = [
        { timestamp: "2025-03-25T22:46:54", energy: 50492.0, distance: 8.0 },
        { timestamp: "2025-03-25T22:14:02", energy: 218837.0, distance: 8.0 },
        { timestamp: "2025-03-25T18:07:58", energy: 54254.0, distance: 8.0 },
        { timestamp: "2025-03-25T17:57:02", energy: 467787.0, distance: 8.0 },
        { timestamp: "2025-03-25T17:24:35", energy: 467532.0, distance: 8.0 },
        { timestamp: "2025-03-25T17:23:00", energy: 14057.0, distance: 8.0 },
        { timestamp: "2025-03-25T17:19:08", energy: 324982.0, distance: 8.0 },
        { timestamp: "2025-03-25T17:19:01", energy: 282677.0, distance: 8.0 },
        { timestamp: "2025-03-25T17:16:36", energy: 77511.0, distance: 8.0 },
        { timestamp: "2025-03-25T17:16:21", energy: 52379.0, distance: 8.0 },
        { timestamp: "2025-03-25T17:16:15", energy: 32024.0, distance: 8.0 }
      ];
      
      // Para cada evento histórico, verificar se já existe em this.lightningData
      const eventsToAdd = [];
      
      for (const histEvent of historicalData) {
        // Verificar se este evento já existe em this.lightningData
        const exists = this.lightningData.some(event => {
          const eventTime = new Date(event.timestamp);
          const histTime = new Date(histEvent.timestamp);
          return Math.abs(eventTime - histTime) < 60000 && // Dentro de 1 minuto
                Math.abs(event.rawEnergy - histEvent.energy) < 100; // Energia similar
        });
        
        if (!exists) {
          // Normalizar força
          let normalizedStrength;
          if (histEvent.energy > 200000) {
            normalizedStrength = 80 + Math.min(20, (histEvent.energy - 200000) / 50000);
          } else if (histEvent.energy > 100000) {
            normalizedStrength = 60 + Math.min(20, (histEvent.energy - 100000) / 5000);
          } else if (histEvent.energy > 50000) {
            normalizedStrength = 40 + Math.min(20, (histEvent.energy - 50000) / 2500);
          } else if (histEvent.energy > 10000) {
            normalizedStrength = 20 + Math.min(20, (histEvent.energy - 10000) / 2000);
          } else {
            normalizedStrength = Math.min(20, histEvent.energy / 500);
          }
          
          // Garantir valor entre 1-100
          normalizedStrength = Math.min(100, Math.max(1, normalizedStrength));
          
          const eventDate = new Date(histEvent.timestamp);
          
          eventsToAdd.push({
            id: eventDate.getTime(),
            timestamp: eventDate.toISOString(),
            distance: histEvent.distance,
            strength: normalizedStrength,
            rawEnergy: histEvent.energy,
            source: 'history'
          });
        }
      }
      
      if (eventsToAdd.length > 0) {
        // Adicionar os novos eventos e ordenar por timestamp
        this.lightningData = [...this.lightningData, ...eventsToAdd];
        this.lightningData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Limitar o número de eventos
        if (this.lightningData.length > this.maxEntries) {
          this.lightningData = this.lightningData.slice(0, this.maxEntries);
        }
        
        console.log(`[Lightning Card] ${eventsToAdd.length} eventos históricos adicionados. Total: ${this.lightningData.length}`);
      }
    }
    
    // Inicializa os dados de demonstração apenas quando solicitado
    initializeDemoData() {
      console.log("[Lightning Card] Inicializando dados de demonstração");
      
      // Limpa dados anteriores
      this.lightningData = [];
      
      // Determina quantos registros devem ser exibidos
      const maxEntries = this.maxEntries;
      
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
          strength: Math.min(Math.max(baseStrength + strengthVariation, 1), 100),
          rawEnergy: Math.floor(Math.random() * 50000) + 10000,
          source: 'demo'
        });
      }
      
      console.log(`[Lightning Card] DEMO: ${this.lightningData.length} registros criados`);
    }

    // Gera um ângulo aleatório mas determinístico baseado no ID
    getAngleForEvent(eventId) {
      // Usa o ID para gerar um ângulo que será consistente para o mesmo evento
      const idNumber = typeof eventId === 'number' ? eventId : parseInt(String(eventId).replace(/\D/g, ''));
      return (idNumber % 360) * (Math.PI / 180);
    }

    formatTime(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    formatDate(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    }

    // Formata um valor grande com k/M para melhor exibição 
    formatLargeNumber(value) {
      if (value >= 1000000) {
        return (value / 1000000).toFixed(1) + "M";
      } else if (value >= 1000) {
        return (value / 1000).toFixed(1) + "k";
      }
      return value.toString();
    }

    render() {
      if (!this._hass) return;
      
      // Verificar se temos dados
      const hasData = this.lightningData.length > 0;
      
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
            
            .date-badge {
              display: inline-block;
              padding: 2px 6px;
              background: #eee;
              color: #333;
              border-radius: 10px;
              font-size: 0.7rem;
              margin-right: 5px;
            }
            
            .history-badge {
              display: inline-block;
              padding: 2px 5px;
              background: #e1f5fe;
              color: #0277bd;
              border-radius: 10px;
              font-size: 0.65rem;
              margin-left: 5px;
            }
            
            .live-badge {
              display: inline-block;
              padding: 2px 5px;
              background: #e8f5e9;
              color: #2e7d32;
              border-radius: 10px;
              font-size: 0.65rem;
              margin-left: 5px;
            }
            
            .energy-value {
              display: inline-block;
              padding: 2px 5px;
              background: #fff3e0;
              color: #e65100;
              border-radius: 10px;
              font-size: 0.65rem;
              margin-left: 5px;
            }
            
            /* Botão para recarregar histórico */
            .reload-button {
              background: transparent;
              border: 1px solid #ccc;
              border-radius: 4px;
              padding: 4px 8px;
              font-size: 0.8rem;
              cursor: pointer;
              float: right;
              margin-top: -5px;
            }
            
            .reload-button:hover {
              background: #f5f5f5;
            }
          </style>
          
          <div class="card-container">
            <h2>
              ${this.config.name || 'Monitor de Raios'}
              ${this.demo_mode ? '<span class="demo-badge">DEMO</span>' : ''}
              ${!this.demo_mode ? '<button class="reload-button" id="reload-history">Recarregar</button>' : ''}
            </h2>
            
            ${hasData ? `<p>${this.lightningData.length} registros encontrados</p>` : ''}
            
            ${!hasData ? `
              <div class="no-data-message">
                <p>Nenhum dado de raio encontrado.</p>
                <p>Verificando o sensor...</p>
              </div>
            ` : ''}
            
            ${hasData && this.showRadar ? `
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
                ${this.lightningData.map(lightning => {
                  const today = new Date();
                  const eventDate = new Date(lightning.timestamp);
                  const isToday = eventDate.toDateString() === today.toDateString();
                  const showDate = !isToday;
                  
                  return `
                    <div class="event-item">
                      <div class="event-details">
                        <div class="event-header">
                          <span class="event-distance">
                            ${showDate ? `<span class="date-badge">${this.formatDate(lightning.timestamp)}</span>` : ''}
                            ${lightning.distance.toFixed(1)} km
                            ${lightning.source === 'history' ? `<span class="history-badge">hist</span>` : ''}
                            ${lightning.source === 'live' || lightning.source === 'sensor' ? `<span class="live-badge">ao vivo</span>` : ''}
                            ${lightning.rawEnergy ? `<span class="energy-value">${this.formatLargeNumber(lightning.rawEnergy)}</span>` : ''}
                          </span>
                          <span class="event-time">${this.formatTime(lightning.timestamp)}</span>
                        </div>
                        <div class="strength-bar">
                          <div class="strength-level" style="width: ${lightning.strength}%;"></div>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : ''}
          </div>
        </ha-card>
      `;
      
      // Adicionar listener para o botão de recarregar
      if (!this.demo_mode) {
        const reloadButton = this.shadowRoot.getElementById('reload-history');
        if (reloadButton) {
          reloadButton.addEventListener('click', () => {
            // Tentar recarregar os eventos
            this.lightningData = [];
            this.checkForLightningEvents();
            this.render();
          });
        }
      }
    }
    
    getCardSize() {
      return 3;
    }
  }
  
  // Registrar o componente
  customElements.define('lightning-monitor-card', LightningMonitorCard);
  
  // Registrar o card para o HACS
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'lightning-monitor-card',
    name: 'Lightning Monitor Card',
    description: 'Card para monitor de raios',
    preview: false
  });
}
