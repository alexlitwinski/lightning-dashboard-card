class LightningMonitorCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.lightningData = [];
    this.lastValues = {}; // Para rastrear valores anteriores
    this.lastUpdateTime = 0; // Para rastrear quando o último evento foi registrado
    this.initialized = false;
    this.demo_mode = false; // Flag para controlar o modo de demonstração
    this.historyLoaded = false; // Flag para controlar se o histórico já foi carregado
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
      } else if (!this.historyLoaded) {
        // Carrega o histórico das entidades na primeira vez
        this.loadHistoryData();
      }
    }
    
    // Atualiza a cada intervalo ou quando as entidades mudam
    this.updateData();
    this.render();
  }
  
  // Carrega dados do histórico do Home Assistant
  async loadHistoryData() {
    if (!this._hass || this.demo_mode) return;
    
    try {
      this.historyLoaded = true; // Marca que já tentou carregar o histórico
      
      // Definir o período de tempo para buscar o histórico (últimas 72 horas para pegar mais eventos)
      const endTime = new Date();
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - 72); // 72 horas atrás (3 dias)
      
      // Array de entidades para buscar
      const entities = [];
      if (this.config.distance_entity) entities.push(this.config.distance_entity);
      if (this.config.energy_entity) entities.push(this.config.energy_entity);
      
      if (entities.length === 0) return;
      
      // Formatar datas para a API do Home Assistant
      const start = startTime.toISOString();
      const end = endTime.toISOString();
      
      // URL para a API de histórico
      const filter = entities.map(e => `filter_entity_id=${e}`).join('&');
      const url = `history/period/${start}?${filter}&end_time=${end}&minimal_response`;
      
      console.log(`Solicitando histórico para: ${url}`);
      
      // Chamar a API do Home Assistant
      this._hass.callApi('GET', url)
        .then(historyData => {
          if (historyData) {
            console.log("Dados de histórico recebidos:", historyData);
            this.processHistoryData(historyData);
          }
        })
        .catch(error => {
          console.error("Erro ao buscar histórico:", error);
        });
      
    } catch (e) {
      console.error("Erro ao carregar histórico:", e);
    }
  }
  
  // Processa os dados do histórico e identifica eventos de raio
  processHistoryData(historyData) {
    if (!historyData || !Array.isArray(historyData)) {
      console.warn("Formato de histórico não reconhecido");
      return;
    }
    
    try {
      console.log("Dados de histórico recebidos:", historyData.length, "entidades");
      
      // Mapear para facilitar o acesso
      const historyMap = {};
      for (const entityHistory of historyData) {
        if (entityHistory.length > 0) {
          const entityId = entityHistory[0].entity_id;
          historyMap[entityId] = entityHistory;
        }
      }
      
      // Verificar se temos histórico para as entidades
      if (!historyMap[this.config.distance_entity] && !historyMap[this.config.energy_entity]) {
        console.warn("Histórico não encontrado para as entidades necessárias");
        return;
      }
      
      const distanceHistory = historyMap[this.config.distance_entity] || [];
      const energyHistory = historyMap[this.config.energy_entity] || [];
      
      console.log(`Histórico de distância: ${distanceHistory.length} registros`);
      console.log(`Histórico de energia: ${energyHistory.length} registros`);
      
      const detectedEvents = [];
      
      // NOVA LÓGICA: Processar principalmente eventos de energia (que geralmente têm mais mudanças relevantes)
      // Para cada mudança significativa na energia, criar um evento
      
      // Percorrer o histórico de energia para encontrar eventos
      let lastEnergyValue = null;
      for (let i = 0; i < energyHistory.length; i++) {
        const energyState = energyHistory[i];
        const energy = parseFloat(energyState.state);
        
        // Verificar se o valor é válido
        if (isNaN(energy) || energy <= 0) continue;
        
        // Determinar se é uma mudança significativa (qualquer mudança no valor de energia é significativa)
        const isSignificantChange = true; // Vamos considerar qualquer mudança registrada como um evento
        
        if (isSignificantChange) {
          // Timestamp do evento de energia
          const eventTime = new Date(energyState.last_changed || energyState.last_updated);
          
          // Encontrar o valor de distância mais próximo deste timestamp
          const closestDistanceState = this.findClosestState(distanceHistory, eventTime);
          let distance = 0;
          
          if (closestDistanceState) {
            distance = parseFloat(closestDistanceState.state);
            if (isNaN(distance) || distance <= 0) distance = 15; // Valor padrão se inválido
          } else {
            distance = 15; // Valor padrão se não encontrar distância
          }
          
          // Normalizar o valor de energia para uma escala de 0-100
          // Valores de energia do sensor podem ser muito grandes (como mostrado nos seus exemplos)
          const normalizedStrength = Math.min(100, Math.max(1, 
            energy > 100000 ? 50 + (energy / 20000) : (energy / 2000)));
          
          detectedEvents.push({
            id: eventTime.getTime(),
            timestamp: eventTime.toISOString(),
            distance: distance,
            strength: normalizedStrength,
            rawEnergy: energy, // Guardar o valor original para depuração
            source: 'history'
          });
          
          console.log(`Evento detectado em ${eventTime.toLocaleString()}: ${distance}km / Energia: ${energy} / Normalizado: ${normalizedStrength}`);
        }
        
        lastEnergyValue = energy;
      }
      
      // Ordenar eventos por timestamp (mais recente primeiro)
      detectedEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      console.log(`Total de eventos detectados do histórico: ${detectedEvents.length}`);
      
      // Adicionar eventos detectados à lista de eventos
      if (detectedEvents.length > 0) {
        // Remover eventos redundantes (muito próximos no tempo)
        const finalEvents = this.deduplicateEvents(detectedEvents);
        
        console.log(`Eventos após remoção de duplicatas: ${finalEvents.length}`);
        
        // Adicionar à lista existente (mantendo eventos em tempo real)
        const existingLiveEvents = this.lightningData.filter(e => e.source === 'live');
        this.lightningData = [...existingLiveEvents, ...finalEvents];
        
        // Ordenar novamente e limitar quantidade
        this.lightningData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        const maxEntries = this.config.max_entries || 10; // Aumentado para 10 por padrão
        if (this.lightningData.length > maxEntries) {
          this.lightningData = this.lightningData.slice(0, maxEntries);
        }
        
        // Forçar uma renderização
        this.render();
      }
      
    } catch (e) {
      console.error("Erro ao processar dados do histórico:", e);
    }
  }
  
  // Função para remover eventos duplicados ou muito próximos
  deduplicateEvents(events) {
    if (!events || events.length === 0) return [];
    
    // Ordenar por timestamp
    const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // Array para os resultados filtrados
    const filteredEvents = [sortedEvents[0]];
    
    // Janela de tempo para considerar eventos como duplicados (em milissegundos)
    const timeWindow = 30000; // 30 segundos em vez de 1 minuto (menos restrição)
    
    // Filtrar eventos muito próximos
    for (let i = 1; i < sortedEvents.length; i++) {
      const currentTime = new Date(sortedEvents[i].timestamp);
      const lastTime = new Date(filteredEvents[filteredEvents.length - 1].timestamp);
      
      if (currentTime - lastTime > timeWindow) {
        filteredEvents.push(sortedEvents[i]);
      }
    }
    
    return filteredEvents;
  }
  
  // Função auxiliar para encontrar o estado mais próximo no tempo
  findClosestState(stateHistory, targetTime) {
    if (!stateHistory || stateHistory.length === 0) return null;
    
    let closestState = null;
    let smallestDiff = Infinity;
    
    for (const state of stateHistory) {
      const stateTime = new Date(state.last_changed || state.last_updated);
      const timeDiff = Math.abs(stateTime - targetTime);
      
      // Considerar estados dentro de uma janela mais ampla (10 minutos)
      if (timeDiff < 600000 && timeDiff < smallestDiff) {
        closestState = state;
        smallestDiff = timeDiff;
      }
    }
    
    return closestState;
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
        strength: Math.min(Math.max(baseStrength + strengthVariation, 1), 100),
        source: 'demo'
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
      // Verifica se as entidades existem
      let dataFound = false;
      
      // Tenta obter dados de entidades separadas
      if (this.config.distance_entity && this.config.energy_entity) {
        const distanceObj = this._hass.states[this.config.distance_entity];
        const energyObj = this._hass.states[this.config.energy_entity];
        
        if (distanceObj && energyObj) {
          const distance = parseFloat(distanceObj.state);
          const energy = parseFloat(energyObj.state);
          
          // Verificar se são números válidos
          if (!isNaN(distance) && !isNaN(energy)) {
            dataFound = true;
            
            // Verificar se os valores são diferentes dos últimos registrados significativamente
            const currentKey = `${Math.round(distance)}_${Math.round(energy)}`;
            const isNewValue = currentKey !== this.lastValues.key;
            
            // Normalizar o valor de energia similar ao processamento histórico
            const normalizedStrength = Math.min(100, Math.max(1, 
              energy > 100000 ? 50 + (energy / 20000) : (energy / 2000)));
            
            if (isNewValue && energy > 0) {
              // Chama com a energia normalizada
              this.addNewLightningEvent(distance, normalizedStrength, energy);
            }
          }
        }
      } 
      
      // Verificar se há dados no histórico local
      if (this.lightningData.length > 0) {
        dataFound = true;
      }
      
      // Verifica se já temos dados ou se devemos usar o modo de demonstração
      if (!dataFound && this.demo_mode) {
        console.log("Nenhum dado encontrado, usando modo de demonstração");
        this.initializeDemoData();
      }
    } catch (e) {
      console.error("Erro ao processar dados:", e);
    }
  }
  
  // Função auxiliar para adicionar um novo evento de raio
  addNewLightningEvent(distance, strength, rawEnergy) {
    const now = new Date();
    const currentTimestamp = now.getTime();
    
    // Limitação do valor de força para no máximo 100
    const limitedStrength = Math.min(Math.max(strength, 1), 100);
    
    // Adiciona um novo evento no início do array
    const newEvent = {
      id: currentTimestamp,
      timestamp: now.toISOString(),
      distance: distance,
      strength: limitedStrength,
      rawEnergy: rawEnergy, // Armazenar o valor bruto para depuração
      source: 'live'
    };
    
    this.lightningData.unshift(newEvent);
    
    // Atualiza os últimos valores registrados
    this.lastValues = {
      key: `${Math.round(distance)}_${Math.round(rawEnergy)}`,
      distance: distance,
      strength: limitedStrength,
      timestamp: currentTimestamp
    };
    
    // Limita a quantidade de registros
    const maxEntries = this.config.max_entries || 10; // Aumentado para 10
    if (this.lightningData.length > maxEntries) {
      this.lightningData = this.lightningData.slice(0, maxEntries);
    }
    
    console.log(`Novo evento de raio (ao vivo): ${distance}km / Força: ${limitedStrength} / Energia: ${rawEnergy}`);
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
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
              <p>Verificando o histórico das entidades...</p>
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
                          ${lightning.source === 'live' ? `<span class="live-badge">ao vivo</span>` : ''}
                          ${lightning.rawEnergy ? `<span class="energy-value">${Math.round(lightning.rawEnergy).toLocaleString()}</span>` : ''}
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
          this.historyLoaded = false;
          this.loadHistoryData();
        });
      }
    }
  }
}

customElements.define('lightning-monitor-card', LightningMonitorCard);

// Registrar o card para o HACS
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'lightning-monitor-card',
  name: 'Lightning Monitor Card',
  description: 'Card para monitor de raios',
});class LightningMonitorCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.lightningData = [];
    this.lastValues = {}; // Para rastrear valores anteriores
    this.lastUpdateTime = 0; // Para rastrear quando o último evento foi registrado
    this.initialized = false;
    this.demo_mode = false; // Flag para controlar o modo de demonstração
    this.historyLoaded = false; // Flag para controlar se o histórico já foi carregado
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
      } else if (!this.historyLoaded) {
        // Carrega o histórico das entidades na primeira vez
        this.loadHistoryData();
      }
    }
    
    // Atualiza a cada intervalo ou quando as entidades mudam
    this.updateData();
    this.render();
  }
  
  // Carrega dados do histórico do Home Assistant
  async loadHistoryData() {
    if (!this._hass || this.demo_mode) return;
    
    try {
      this.historyLoaded = true; // Marca que já tentou carregar o histórico
      
      // Definir o período de tempo para buscar o histórico (últimas 72 horas para pegar mais eventos)
      const endTime = new Date();
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - 72); // 72 horas atrás (3 dias)
      
      // Array de entidades para buscar
      const entities = [];
      if (this.config.distance_entity) entities.push(this.config.distance_entity);
      if (this.config.energy_entity) entities.push(this.config.energy_entity);
      
      if (entities.length === 0) return;
      
      // Formatar datas para a API do Home Assistant
      const start = startTime.toISOString();
      const end = endTime.toISOString();
      
      // URL para a API de histórico
      const filter = entities.map(e => `filter_entity_id=${e}`).join('&');
      const url = `history/period/${start}?${filter}&end_time=${end}&minimal_response`;
      
      console.log(`Solicitando histórico para: ${url}`);
      
      // Chamar a API do Home Assistant
      this._hass.callApi('GET', url)
        .then(historyData => {
          if (historyData) {
            console.log("Dados de histórico recebidos:", historyData);
            this.processHistoryData(historyData);
          }
        })
        .catch(error => {
          console.error("Erro ao buscar histórico:", error);
        });
      
    } catch (e) {
      console.error("Erro ao carregar histórico:", e);
    }
  }
  
  // Processa os dados do histórico e identifica eventos de raio
  processHistoryData(historyData) {
    if (!historyData || !Array.isArray(historyData)) {
      console.warn("Formato de histórico não reconhecido");
      return;
    }
    
    try {
      console.log("Dados de histórico recebidos:", historyData.length, "entidades");
      
      // Mapear para facilitar o acesso
      const historyMap = {};
      for (const entityHistory of historyData) {
        if (entityHistory.length > 0) {
          const entityId = entityHistory[0].entity_id;
          historyMap[entityId] = entityHistory;
        }
      }
      
      // Verificar se temos histórico para as entidades
      if (!historyMap[this.config.distance_entity] && !historyMap[this.config.energy_entity]) {
        console.warn("Histórico não encontrado para as entidades necessárias");
        return;
      }
      
      const distanceHistory = historyMap[this.config.distance_entity] || [];
      const energyHistory = historyMap[this.config.energy_entity] || [];
      
      console.log(`Histórico de distância: ${distanceHistory.length} registros`);
      console.log(`Histórico de energia: ${energyHistory.length} registros`);
      
      const detectedEvents = [];
      
      // NOVA LÓGICA: Processar principalmente eventos de energia (que geralmente têm mais mudanças relevantes)
      // Para cada mudança significativa na energia, criar um evento
      
      // Percorrer o histórico de energia para encontrar eventos
      let lastEnergyValue = null;
      for (let i = 0; i < energyHistory.length; i++) {
        const energyState = energyHistory[i];
        const energy = parseFloat(energyState.state);
        
        // Verificar se o valor é válido
        if (isNaN(energy) || energy <= 0) continue;
        
        // Determinar se é uma mudança significativa (qualquer mudança no valor de energia é significativa)
        const isSignificantChange = true; // Vamos considerar qualquer mudança registrada como um evento
        
        if (isSignificantChange) {
          // Timestamp do evento de energia
          const eventTime = new Date(energyState.last_changed || energyState.last_updated);
          
          // Encontrar o valor de distância mais próximo deste timestamp
          const closestDistanceState = this.findClosestState(distanceHistory, eventTime);
          let distance = 0;
          
          if (closestDistanceState) {
            distance = parseFloat(closestDistanceState.state);
            if (isNaN(distance) || distance <= 0) distance = 15; // Valor padrão se inválido
          } else {
            distance = 15; // Valor padrão se não encontrar distância
          }
          
          // Normalizar o valor de energia para uma escala de 0-100
          // Valores de energia do sensor podem ser muito grandes (como mostrado nos seus exemplos)
          const normalizedStrength = Math.min(100, Math.max(1, 
            energy > 100000 ? 50 + (energy / 20000) : (energy / 2000)));
          
          detectedEvents.push({
            id: eventTime.getTime(),
            timestamp: eventTime.toISOString(),
            distance: distance,
            strength: normalizedStrength,
            rawEnergy: energy, // Guardar o valor original para depuração
            source: 'history'
          });
          
          console.log(`Evento detectado em ${eventTime.toLocaleString()}: ${distance}km / Energia: ${energy} / Normalizado: ${normalizedStrength}`);
        }
        
        lastEnergyValue = energy;
      }
      
      // Ordenar eventos por timestamp (mais recente primeiro)
      detectedEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      console.log(`Total de eventos detectados do histórico: ${detectedEvents.length}`);
      
      // Adicionar eventos detectados à lista de eventos
      if (detectedEvents.length > 0) {
        // Remover eventos redundantes (muito próximos no tempo)
        const finalEvents = this.deduplicateEvents(detectedEvents);
        
        console.log(`Eventos após remoção de duplicatas: ${finalEvents.length}`);
        
        // Adicionar à lista existente (mantendo eventos em tempo real)
        const existingLiveEvents = this.lightningData.filter(e => e.source === 'live');
        this.lightningData = [...existingLiveEvents, ...finalEvents];
        
        // Ordenar novamente e limitar quantidade
        this.lightningData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        const maxEntries = this.config.max_entries || 10; // Aumentado para 10 por padrão
        if (this.lightningData.length > maxEntries) {
          this.lightningData = this.lightningData.slice(0, maxEntries);
        }
        
        // Forçar uma renderização
        this.render();
      }
      
    } catch (e) {
      console.error("Erro ao processar dados do histórico:", e);
    }
  }
  
  // Função para remover eventos duplicados ou muito próximos
  deduplicateEvents(events) {
    if (!events || events.length === 0) return [];
    
    // Ordenar por timestamp
    const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // Array para os resultados filtrados
    const filteredEvents = [sortedEvents[0]];
    
    // Janela de tempo para considerar eventos como duplicados (em milissegundos)
    const timeWindow = 30000; // 30 segundos em vez de 1 minuto (menos restrição)
    
    // Filtrar eventos muito próximos
    for (let i = 1; i < sortedEvents.length; i++) {
      const currentTime = new Date(sortedEvents[i].timestamp);
      const lastTime = new Date(filteredEvents[filteredEvents.length - 1].timestamp);
      
      if (currentTime - lastTime > timeWindow) {
        filteredEvents.push(sortedEvents[i]);
      }
    }
    
    return filteredEvents;
  }
  
  // Função auxiliar para encontrar o estado mais próximo no tempo
  findClosestState(stateHistory, targetTime) {
    if (!stateHistory || stateHistory.length === 0) return null;
    
    let closestState = null;
    let smallestDiff = Infinity;
    
    for (const state of stateHistory) {
      const stateTime = new Date(state.last_changed || state.last_updated);
      const timeDiff = Math.abs(stateTime - targetTime);
      
      // Considerar estados dentro de uma janela mais ampla (10 minutos)
      if (timeDiff < 600000 && timeDiff < smallestDiff) {
        closestState = state;
        smallestDiff = timeDiff;
      }
    }
    
    return closestState;
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
        strength: Math.min(Math.max(baseStrength + strengthVariation, 1), 100),
        source: 'demo'
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
      // Verifica se as entidades existem
      let dataFound = false;
      
      // Tenta obter dados de entidades separadas
      if (this.config.distance_entity && this.config.energy_entity) {
        const distanceObj = this._hass.states[this.config.distance_entity];
        const energyObj = this._hass.states[this.config.energy_entity];
        
        if (distanceObj && energyObj) {
          const distance = parseFloat(distanceObj.state);
          const energy = parseFloat(energyObj.state);
          
          // Verificar se são números válidos
          if (!isNaN(distance) && !isNaN(energy)) {
            dataFound = true;
            
            // Verificar se os valores são diferentes dos últimos registrados significativamente
            const currentKey = `${Math.round(distance)}_${Math.round(energy)}`;
            const isNewValue = currentKey !== this.lastValues.key;
            
            // Normalizar o valor de energia similar ao processamento histórico
            const normalizedStrength = Math.min(100, Math.max(1, 
              energy > 100000 ? 50 + (energy / 20000) : (energy / 2000)));
            
            if (isNewValue && energy > 0) {
              // Chama com a energia normalizada
              this.addNewLightningEvent(distance, normalizedStrength, energy);
            }
          }
        }
      } 
      
      // Verificar se há dados no histórico local
      if (this.lightningData.length > 0) {
        dataFound = true;
      }
      
      // Verifica se já temos dados ou se devemos usar o modo de demonstração
      if (!dataFound && this.demo_mode) {
        console.log("Nenhum dado encontrado, usando modo de demonstração");
        this.initializeDemoData();
      }
    } catch (e) {
      console.error("Erro ao processar dados:", e);
    }
  }
  
  // Função auxiliar para adicionar um novo evento de raio
  addNewLightningEvent(distance, strength, rawEnergy) {
    const now = new Date();
    const currentTimestamp = now.getTime();
    
    // Limitação do valor de força para no máximo 100
    const limitedStrength = Math.min(Math.max(strength, 1), 100);
    
    // Adiciona um novo evento no início do array
    const newEvent = {
      id: currentTimestamp,
      timestamp: now.toISOString(),
      distance: distance,
      strength: limitedStrength,
      rawEnergy: rawEnergy, // Armazenar o valor bruto para depuração
      source: 'live'
    };
    
    this.lightningData.unshift(newEvent);
    
    // Atualiza os últimos valores registrados
    this.lastValues = {
      key: `${Math.round(distance)}_${Math.round(rawEnergy)}`,
      distance: distance,
      strength: limitedStrength,
      timestamp: currentTimestamp
    };
    
    // Limita a quantidade de registros
    const maxEntries = this.config.max_entries || 10; // Aumentado para 10
    if (this.lightningData.length > maxEntries) {
      this.lightningData = this.lightningData.slice(0, maxEntries);
    }
    
    console.log(`Novo evento de raio (ao vivo): ${distance}km / Força: ${limitedStrength} / Energia: ${rawEnergy}`);
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
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
              <p>Verificando o histórico das entidades...</p>
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
                          ${lightning.source === 'live' ? `<span class="live-badge">ao vivo</span>` : ''}
                          ${lightning.rawEnergy ? `<span class="energy-value">${Math.round(lightning.rawEnergy).toLocaleString()}</span>` : ''}
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
          this.historyLoaded = false;
          this.loadHistoryData();
        });
      }
    }
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
