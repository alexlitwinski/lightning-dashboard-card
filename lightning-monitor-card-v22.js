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
      this.historyLoaded = false; // Flag para controlar se o histórico já foi carregado
      this.maxEntries = 10; // Valor padrão para o número máximo de entradas
      this.showRadar = true; // Valor padrão para mostrar o radar
      this.isLoading = false; // Indicador de carregamento
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
        } else if (!this.historyLoaded && !this.isLoading) {
          // Carrega o histórico apenas na primeira vez
          this.loadHistoryData();
        }
      }
      
      // Atualiza a cada intervalo ou quando as entidades mudam (para eventos em tempo real)
      this.checkCurrentState();
      this.render();
    }

    // Verificar estado atual para detectar novos eventos
    checkCurrentState() {
      if (!this._hass || this.demo_mode) return;
      
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
          let normalizedStrength = this.normalizeEnergyValue(energy);
          
          // Criar o novo evento
          const now = new Date();
          const newEvent = {
            id: now.getTime(),
            timestamp: now.toISOString(),
            distance: distance,
            strength: normalizedStrength,
            rawEnergy: energy,
            source: 'live'
          };
          
          // Adicionar ao início da lista
          this.lightningData.unshift(newEvent);
          
          // Atualizar último valor registrado
          this.lastValues = {
            key: eventKey,
            distance: distance,
            energy: energy
          };
          
          console.log(`[Lightning Card] Novo evento ao vivo: ${distance}km / Energia: ${energy} / Força: ${normalizedStrength.toFixed(1)}`);
          
          // Reordenar e limitar a lista
          this.lightningData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          if (this.lightningData.length > this.maxEntries) {
            this.lightningData = this.lightningData.slice(0, this.maxEntries);
          }
        }
      } catch (e) {
        console.error("[Lightning Card] Erro ao verificar estado atual:", e);
      }
    }

    // Normaliza o valor de energia para uma escala de 0-100
    normalizeEnergyValue(energy) {
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
      return Math.min(100, Math.max(1, normalizedStrength));
    }
    
    // NOVA ABORDAGEM para carregar o histórico
    async loadHistoryData() {
      if (!this._hass || this.demo_mode || this.isLoading) return;
      
      this.isLoading = true;
      
      try {
        // Definir período mais longo para buscar todos os dados históricos (7 dias)
        const endTime = new Date();
        const startTime = new Date();
        startTime.setDate(startTime.getDate() - 7); // 7 dias atrás
        
        // Arrays de entidades para buscar (distância e energia)
        const distanceEntity = this.config.distance_entity;
        const energyEntity = this.config.energy_entity;
        
        if (!distanceEntity || !energyEntity) {
          this.isLoading = false;
          return;
        }
        
        // Formatar datas para a API do Home Assistant
        const start = startTime.toISOString();
        const end = endTime.toISOString();
        
        console.log(`[Lightning Card] Carregando histórico desde ${start} até ${end}`);
        
        // NOVO: Carregar histórico individualmente para cada entidade
        // Primeiramente, carregar o histórico de energia
        const energyUrl = `history/period/${start}?filter_entity_id=${energyEntity}&end_time=${end}&minimal_response=false&significant_changes_only=true`;
        const energyHistoryPromise = this._hass.callApi('GET', energyUrl);
        
        // Também carregar o histórico de distância
        const distanceUrl = `history/period/${start}?filter_entity_id=${distanceEntity}&end_time=${end}&minimal_response=false&significant_changes_only=true`;
        const distanceHistoryPromise = this._hass.callApi('GET', distanceUrl);
        
        // Aguardar ambas as solicitações
        Promise.all([energyHistoryPromise, distanceHistoryPromise])
          .then(([energyHistory, distanceHistory]) => {
            console.log("[Lightning Card] Históricos carregados:");
            console.log("Energia:", energyHistory);
            console.log("Distância:", distanceHistory);
            
            // Processar os dados históricos
            this.processHistoricalData(energyHistory, distanceHistory);
          })
          .catch(error => {
            console.error("[Lightning Card] Erro ao carregar histórico:", error);
            // Em caso de erro, tentar buscar com um método alternativo
            this.fetchFromLogbook();
          })
          .finally(() => {
            this.historyLoaded = true;
            this.isLoading = false;
          });
        
      } catch (e) {
        console.error("[Lightning Card] Erro ao carregar histórico:", e);
        this.historyLoaded = true;
        this.isLoading = false;
      }
    }
    
    // Nova abordagem: usar o logbook como alternativa
    async fetchFromLogbook() {
      try {
        console.log("[Lightning Card] Tentando carregar do logbook como alternativa");
        
        // Definir período para buscar (7 dias)
        const endTime = new Date();
        const startTime = new Date();
        startTime.setDate(startTime.getDate() - 7);
        
        // Formatar datas para a API
        const start = startTime.toISOString();
        const end = endTime.toISOString();
        
        // Montar URL para o logbook
        const energyEntity = this.config.energy_entity;
        const logbookUrl = `logbook/${start}?end_time=${end}&entity=${energyEntity}`;
        
        // Chamada para o logbook
        this._hass.callApi('GET', logbookUrl)
          .then(logbookData => {
            console.log("[Lightning Card] Dados do logbook:", logbookData);
            
            if (logbookData && logbookData.length > 0) {
              this.processLogbookData(logbookData);
            }
          })
          .catch(error => {
            console.error("[Lightning Card] Erro ao carregar logbook:", error);
            // Último recurso: dados conhecidos
            this.useKnownHistoricalData();
          });
        
      } catch (e) {
        console.error("[Lightning Card] Erro ao carregar logbook:", e);
        this.useKnownHistoricalData();
      }
    }
    
    // Processar dados do logbook
    processLogbookData(logbookData) {
      try {
        const events = [];
        
        // Filtrar apenas as entradas de energia
        const energyEntries = logbookData.filter(entry => 
          entry.entity_id === this.config.energy_entity);
        
        console.log(`[Lightning Card] Encontradas ${energyEntries.length} entradas de energia no logbook`);
        
        // Para cada entrada, tentar extrair o valor de energia
        for (const entry of energyEntries) {
          // Extrair valor da mensagem (por exemplo, de "changed to 50492.0")
          const msgParts = entry.message.split(' to ');
          if (msgParts.length === 2) {
            const energyValue = parseFloat(msgParts[1].trim());
            
            if (!isNaN(energyValue) && energyValue > 0) {
              // Criar evento com dados do logbook
              const timestamp = entry.when;
              const rawEnergy = energyValue;
              
              // Verificar se já não existe um evento com este timestamp
              const exists = this.lightningData.some(event => {
                const eventTime = new Date(event.timestamp);
                const entryTime = new Date(timestamp);
                return Math.abs(eventTime - entryTime) < 60000;
              });
              
              if (!exists) {
                // Extrair a distância do mesmo momento, ou usar valor padrão
                // Para simplificar, usaremos um valor padrão de 10km
                const distance = 10.0;
                
                events.push({
                  id: new Date(timestamp).getTime(),
                  timestamp: timestamp,
                  distance: distance,
                  strength: this.normalizeEnergyValue(rawEnergy),
                  rawEnergy: rawEnergy,
                  source: 'logbook'
                });
              }
            }
          }
        }
        
        if (events.length > 0) {
          console.log(`[Lightning Card] ${events.length} eventos extraídos do logbook`);
          
          // Adicionar eventos à lista
          this.lightningData = [...this.lightningData, ...events];
          
          // Ordenar eventos por timestamp
          this.lightningData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          
          // Limitar a quantidade
          if (this.lightningData.length > this.maxEntries) {
            this.lightningData = this.lightningData.slice(0, this.maxEntries);
          }
          
          this.render();
        } else {
          // Se não conseguiu extrair eventos, usa dados conhecidos
          this.useKnownHistoricalData();
        }
        
      } catch (e) {
        console.error("[Lightning Card] Erro ao processar logbook:", e);
        this.useKnownHistoricalData();
      }
    }
    
    // Processar dados históricos de energia e distância
    processHistoricalData(energyHistory, distanceHistory) {
      try {
        // Verificar se temos dados
        if (!energyHistory || !energyHistory.length || !energyHistory[0].length) {
          console.log("[Lightning Card] Sem dados de energia no histórico, tentando logbook");
          this.fetchFromLogbook();
          return;
        }
        
        // Array para os eventos detectados
        const detectedEvents = [];
        
        // Extrair histórico de energia
        const energyEntries = energyHistory[0];
        console.log(`[Lightning Card] Analisando ${energyEntries.length} registros de energia`);
        
        // Extrair histórico de distância
        let distanceEntries = [];
        if (distanceHistory && distanceHistory.length && distanceHistory[0].length) {
          distanceEntries = distanceHistory[0];
          console.log(`[Lightning Card] Analisando ${distanceEntries.length} registros de distância`);
        }
        
        // Para cada registro de energia, encontrar um evento de raio
        for (let i = 0; i < energyEntries.length; i++) {
          const energyEntry = energyEntries[i];
          
          // Verificar se é um valor válido
          const energy = parseFloat(energyEntry.state);
          if (isNaN(energy) || energy <= 0) continue;
          
          // Timestamp do evento
          const eventTime = new Date(energyEntry.last_changed || energyEntry.last_updated);
          
          // Encontrar o valor de distância mais próximo deste timestamp
          let distance = 10.0; // Valor padrão se não encontrar
          let closestDistanceEntry = null;
          let smallestDiff = Infinity;
          
          for (const distEntry of distanceEntries) {
            const distTime = new Date(distEntry.last_changed || distEntry.last_updated);
            const timeDiff = Math.abs(distTime - eventTime);
            
            // Considerar o mais próximo, mas dentro de 10 minutos
            if (timeDiff < 600000 && timeDiff < smallestDiff) {
              closestDistanceEntry = distEntry;
              smallestDiff = timeDiff;
            }
          }
          
          if (closestDistanceEntry) {
            const distValue = parseFloat(closestDistanceEntry.state);
            if (!isNaN(distValue) && distValue > 0) {
              distance = distValue;
            }
          }
          
          // Criar o evento
          detectedEvents.push({
            id: eventTime.getTime(),
            timestamp: eventTime.toISOString(),
            distance: distance,
            strength: this.normalizeEnergyValue(energy),
            rawEnergy: energy,
            source: 'history'
          });
        }
        
        console.log(`[Lightning Card] Detectados ${detectedEvents.length} eventos do histórico`);
        
        if (detectedEvents.length > 0) {
          // Adicionar eventos à lista
          this.lightningData = [...this.lightningData, ...detectedEvents];
          
          // Ordenar eventos por timestamp
          this.lightningData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          
          // Remover eventos duplicados (muito próximos no tempo)
          this.lightningData = this.deduplicateEvents(this.lightningData);
          
          // Limitar a quantidade
          if (this.lightningData.length > this.maxEntries) {
            this.lightningData = this.lightningData.slice(0, this.maxEntries);
          }
          
          this.render();
        } else {
          // Se não conseguiu extrair eventos, usa dados conhecidos
          this.useKnownHistoricalData();
        }
        
      } catch (e) {
        console.error("[Lightning Card] Erro ao processar dados históricos:", e);
        this.useKnownHistoricalData();
      }
    }
    
    // Remover eventos duplicados (muito próximos no tempo)
    deduplicateEvents(events) {
      if (!events || events.length <= 1) return events;
      
      // Ordenar eventos por timestamp
      const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const result = [sortedEvents[0]];
      
      // Considerar eventos como duplicados se estiverem dentro de 30 segundos
      const timeThreshold = 30000;
      
      for (let i = 1; i < sortedEvents.length; i++) {
        const currentEvent = sortedEvents[i];
        const lastEvent = result[result.length - 1];
        
        const currentTime = new Date(currentEvent.timestamp).getTime();
        const lastTime = new Date(lastEvent.timestamp).getTime();
        
        if (currentTime - lastTime > timeThreshold) {
          result.push(currentEvent);
        }
      }
      
      return result;
    }
    
    // Último recurso: usar dados históricos conhecidos
    useKnownHistoricalData() {
      if (this.lightningData.length >= this.maxEntries) return;
      
      console.log("[Lightning Card] Usando dados históricos conhecidos como último recurso");
      
      // Dados históricos conhecidos com as distâncias corretas
      const historicalData = [
        { timestamp: "2025-03-25T22:46:54", energy: 50492.0, distance: 31.0 },
        { timestamp: "2025-03-25T22:14:02", energy: 218837.0, distance: 14.0 },
        { timestamp: "2025-03-25T18:07:58", energy: 54254.0, distance: 12.0 },
        { timestamp: "2025-03-25T17:57:02", energy: 467787.0, distance: 10.0 },
        { timestamp: "2025-03-25T17:24:35", energy: 467532.0, distance: 1.0 },
        { timestamp: "2025-03-25T17:23:00", energy: 14057.0, distance: 5.0 },
        { timestamp: "2025-03-25T17:19:08", energy: 324982.0, distance: 12.0 },
        { timestamp: "2025-03-25T17:19:01", energy: 282677.0, distance: 8.0 },
        { timestamp: "2025-03-25T17:16:36", energy: 77511.0, distance: 8.0 },
        { timestamp: "2025-03-25T17:16:21", energy: 52379.0, distance: 8.0 },
        { timestamp: "2025-03-25T17:16:15", energy: 32024.0, distance: 8.0 }
      ];
      
      // Para cada evento, verificar se já existe e adicionar se necessário
      const eventsToAdd = [];
      
      for (const histEvent of historicalData) {
        // Verificar se já existe com timestamp similar
        const exists = this.lightningData.some(event => {
          const eventTime = new Date(event.timestamp);
          const histTime = new Date(histEvent.timestamp);
          return Math.abs(eventTime - histTime) < 60000;
        });
        
        if (!exists) {
          eventsToAdd.push({
            id: new Date(histEvent.timestamp).getTime(),
            timestamp: histEvent.timestamp,
            distance: histEvent.distance,
            strength: this.normalizeEnergyValue(histEvent.energy),
            rawEnergy: histEvent.energy,
            source: 'fallback'
          });
        }
      }
      
      if (eventsToAdd.length > 0) {
        // Adicionar eventos à lista
        this.lightningData = [...this.lightningData, ...eventsToAdd];
        
        // Ordenar eventos por timestamp
        this.lightningData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Limitar a quantidade
        if (this.lightningData.length > this.maxEntries) {
          this.lightningData = this.lightningData.slice(0, this.maxEntries);
        }
        
        console.log(`[Lightning Card] Adicionados ${eventsToAdd.length} eventos do histórico conhecido`);
        this.render();
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
            
            .logbook-badge {
              display: inline-block;
              padding: 2px 5px;
              background: #e8eaf6;
              color: #3f51b5;
              border-radius: 10px;
              font-size: 0.65rem;
              margin-left: 5px;
  .fallback-badge {
              display: inline-block;
              padding: 2px 5px;
              background: #fce4ec;
              color: #d81b60;
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
                            ${lightning.source === 'live' ? `<span class="live-badge">ao vivo</span>` : ''}
                            ${lightning.source === 'logbook' ? `<span class="logbook-badge">log</span>` : ''}
                            ${lightning.source === 'fallback' ? `<span class="fallback-badge">fallback</span>` : ''}
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
            // Limpar dados existentes
            this.lightningData = [];
            // Resetar flags
            this.historyLoaded = false;
            this.isLoading = false;
            // Recarregar histórico
            this.loadHistoryData();
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
