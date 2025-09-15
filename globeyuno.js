   // Track mouse position for tooltip placement (must be defined before listeners)
    var lastMousePos = { x: 0, y: 0 };

    // Wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', function () {
      console.log('DOM loaded, starting initialization...');
      // Track mouse for tooltip positioning
      document.addEventListener('mousemove', function (e) {
        // Use pageX/Y to be robust with scroll; fallback to clientX/Y
        lastMousePos.x = (typeof e.pageX === 'number' ? e.pageX : e.clientX);
        lastMousePos.y = (typeof e.pageY === 'number' ? e.pageY : e.clientY);
      }, { passive: true });

      // Add loading indicator
      document.getElementById('globeViz').innerHTML = '<div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif; color: #666;"><div><h2>Loading Globe...</h2><p>Please wait while the interactive globe loads.</p></div></div>';

      // Check if Globe library is loaded, wait if not
      let waitCount = 0;
      const maxWait = 100; // 10 seconds max

      function waitForGlobe() {
        if (typeof Globe !== 'undefined') {
          console.log('Globe library loaded, proceeding...');
          initializeGlobe();
        } else if (waitCount < maxWait) {
          console.log('Waiting for Globe library...', waitCount);
          waitCount++;
          setTimeout(waitForGlobe, 100);
        } else {
          console.error('Globe library failed to load after 10 seconds');
          document.getElementById('globeViz').innerHTML = '<div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif; color: red;"><div><h2>Error Loading Globe</h2><p>Globe.gl library failed to load. Please check your internet connection and try again.</p></div></div>';
        }
      }

      // Start waiting for Globe library
      waitForGlobe();

      function initializeGlobe() {

        // Simple color scale implementation with domain support
        function createColorScale(interpolator) {
          let domain = [0, 1];

          return {
            domain: function (newDomain) {
              if (newDomain) {
                domain = newDomain;
                return this;
              }
              return domain;
            },
            __call__: function (value) {
              // Normalize value to 0-1 range based on domain
              const normalized = (value - domain[0]) / (domain[1] - domain[0]);
              const clamped = Math.max(0, Math.min(1, normalized));
              return interpolator(clamped);
            }
          };
        }

        // Simple interpolator for yellow-orange-red colors
        function interpolateYlOrRd(t) {
          if (t < 0.5) {
            // Yellow to orange
            const r = 1;
            const g = 1 - t * 2;
            const b = 0;
            return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
          } else {
            // Orange to red
            const r = 1;
            const g = 1 - (t - 0.5) * 2;
            const b = 0;
            return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
          }
        }

        const colorScale = createColorScale(interpolateYlOrRd);

        // GDP per capita (avoiding countries with small pop)
        const getVal = feat => feat.properties.GDP_MD_EST / Math.max(1e5, feat.properties.POP_EST);

        // Global variables for UI state
        let selectedContinent = 'North America'; // Default selection
        let selectedCountry = null; // Selected country
        let hoveredCountry = null;
        let hoveredContinent = null;
        let world = null; // Will be set when globe is created
        let countries = null; // Will be set when data is loaded
        let dotsData = []; // Will store the dots data

        // Auto-rotation variables
        let autoRotate = true;
        let autoRotateInterval = null;
        let resumeRotationTimeout = null;
        let hoverTimeout = null;

        // Continent mapping with country names as fallback for countries with -99 ISO_A3
        const continentMapping = {
          'North America': ['USA', 'CAN', 'MEX', 'GTM', 'BLZ', 'SLV', 'HND', 'NIC', 'CRI', 'PAN', 'CUB', 'JAM', 'HTI', 'DOM', 'TTO', 'BHS', 'BRB', 'DMA', 'GRD', 'KNA', 'LCA', 'VCT', 'ATG'],
          'South America': ['BRA', 'ARG', 'CHL', 'PER', 'COL', 'VEN', 'ECU', 'BOL', 'PRY', 'URY', 'GUY', 'SUR', 'GUF'],
          'Europe': ['DEU', 'GBR', 'FRA', 'ITA', 'ESP', 'UKR', 'POL', 'ROU', 'NLD', 'BEL', 'CZE', 'GRC', 'PRT', 'SWE', 'HUN', 'AUT', 'BLR', 'CHE', 'BGR', 'SRB', 'DNK', 'FIN', 'SVK', 'NOR', 'IRL', 'HRV', 'BIH', 'ALB', 'LTU', 'SLO', 'LVA', 'EST', 'MKD', 'MDA', 'LUX', 'MLT', 'ISL', 'MNE', 'CYP', 'LIE', 'AND', 'MCO', 'SMR', 'VAT'],
          'Asia': ['CHN', 'IND', 'IDN', 'PAK', 'BGD', 'JPN', 'PHL', 'VNM', 'THA', 'MMR', 'KOR', 'IRQ', 'AFG', 'UZB', 'MYS', 'YEM', 'NPL', 'PRK', 'TWN', 'SYR', 'KAZ', 'KHM', 'JOR', 'AZE', 'TJK', 'LAO', 'LBN', 'KGZ', 'TKM', 'SGP', 'GEO', 'ARM', 'MNG', 'OMN', 'LKA', 'BTN', 'MDV', 'BRN'],
          'Middle East': ['TUR', 'IRN', 'SAU', 'IRQ', 'SYR', 'JOR', 'ISR', 'LBN', 'QAT', 'BHR', 'KWT', 'ARE', 'OMN', 'YEM'],
          'Africa': ['NGA', 'ETH', 'EGY', 'COD', 'TZA', 'ZAF', 'KEN', 'UGA', 'DZA', 'SDN', 'MAR', 'GHA', 'MOZ', 'AGO', 'MDG', 'CMR', 'NER', 'BFA', 'MLI', 'MWI', 'ZMB', 'SOM', 'SEN', 'TCD', 'ZWE', 'GIN', 'RWA', 'BEN', 'TUN', 'BWA', 'LBY', 'LBR', 'SLE', 'CAF', 'MRT', 'ERI', 'GAB', 'GMB', 'GIN', 'GNB', 'CIV', 'TGO', 'STP', 'COM', 'DJI', 'GNQ', 'SYC', 'MUS', 'CPV', 'SWZ', 'LSO']
        };

        // Special mapping for countries with -99 ISO_A3 codes
        const specialCountryMapping = {
          'France': 'Europe',
          'Norway': 'Europe',
          'Northern Cyprus': 'Asia',
          'Kosovo': 'Europe',
          'Somaliland': 'Africa'
        };

        // ===== NON-SELECTABLE COUNTRIES CONFIGURATION =====
        // Add countries to this list to make them non-selectable on the globe
        // You can use either ISO_A3 country codes or full country names (ADMIN property)
        const nonSelectableCountries = [
          'RUS',      // Russia (ISO_A3 code)
          // 'CHN',   // Uncomment to make China non-selectable
          // 'USA',   // Uncomment to make USA non-selectable
          // 'India', // You can also use country names
          // Add more countries here as needed...
        ];

        // Function to check if a country is selectable
        function isCountrySelectable(countryCode, countryName = null) {
          // Check by ISO_A3 code
          if (nonSelectableCountries.includes(countryCode)) {
            return false;
          }
          
          // Check by country name (ADMIN property)
          if (countryName && nonSelectableCountries.includes(countryName)) {
            return false;
          }
          
          return true;
        }

        // Function to get continent for a country
        function getContinentForCountry(countryCode, countryName = null) {
          // First try by ISO_A3 code
          for (const [continent, codes] of Object.entries(continentMapping)) {
            if (codes.includes(countryCode)) {
              return continent;
            }
          }

          // If not found and we have a country name, try special mapping
          if (countryName && specialCountryMapping[countryName]) {
            return specialCountryMapping[countryName];
          }

          // console.log(`Country code ${countryCode} (${countryName || 'unknown'}) not found in continent mapping`);
          return 'Other';
        }

        // Function to update hexPolygon colors based on selections
        function updateHexPolygonColors() {
          if (world) {
            world.hexPolygonsData(countries.features.filter(d => d.properties.ISO_A2 !== 'AQ'));
          }
        }

        // Function to update dots color (for compatibility)
        function updateDotsColor(worldInstance) {
          // No-op since we're using hexPolygons
        }

        // Function to update polygon colors (for compatibility)
        function updatePolygonColors(worldInstance) {
          // No-op since we're using hexPolygons
        }

        // Load countries data from embedded JavaScript variable
        console.log('Loading countries data...');
        console.log('Countries data available:', typeof countriesData !== 'undefined');

        if (typeof countriesData === 'undefined') {
          console.error('Countries data not loaded!');
          document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: Arial, sans-serif;"><h2>Error Loading Globe</h2><p>Countries data not found. Please ensure countries-data.js is loaded.</p></div>';
          return;
        }

        countries = countriesData; // Store globally
        console.log('Countries loaded:', countries.features.length, 'countries');

        const maxVal = Math.max(...countries.features.map(getVal));
        colorScale.domain([0, maxVal]);

        // Create dots only within country boundaries
        dotsData = [];
        console.log('Generating dots within countries only...');

        // Global dot grid parameters - flexible grid with consistent spacing
        const latStep = 1.8; // Degrees between dots (balanced density)
        const baseLngStep = 1.8; // Base longitude step (balanced density)

        // Simple point-in-polygon test
        function isPointInPolygon(point, polygon) {
          const x = point[0], y = point[1];
          let inside = false;

          for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];

            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
              inside = !inside;
            }
          }

          return inside;
        }

        // Check if a point is inside any country
        function isPointInAnyCountry(lat, lng) {
          const point = [lng, lat];

          for (const country of countries.features) {
            if (country.properties.ISO_A2 === 'AQ') continue; // Skip Antarctica

            const coordinates = country.geometry.coordinates;

            if (country.geometry.type === 'Polygon') {
              // Single polygon
              if (isPointInPolygon(point, coordinates[0])) {
                return true;
              }
            } else if (country.geometry.type === 'MultiPolygon') {
              // Multi-polygon
              for (const polygon of coordinates) {
                if (isPointInPolygon(point, polygon[0])) {
                  return true;
                }
              }
            }
          }

          return false;
        }

        // Use hexPolygonsData for proper honeycomb tessellation
        // This creates a true hexagonal grid pattern automatically
        dotsData = []; // Clear manual dots - we'll use hexPolygons instead

        // Function to find which country a point belongs to
        function findCountryForPoint(lat, lng) {
          const point = [lng, lat];

          for (const country of countries.features) {
            if (country.properties.ISO_A2 === 'AQ') continue; // Skip Antarctica

            const coordinates = country.geometry.coordinates;

            if (country.geometry.type === 'Polygon') {
              // Single polygon
              if (isPointInPolygon(point, coordinates[0])) {
                return country;
              }
            } else if (country.geometry.type === 'MultiPolygon') {
              // Multi-polygon
              for (const polygon of coordinates) {
                if (isPointInPolygon(point, polygon[0])) {
                  return country;
                }
              }
            }
          }

          return null;
        }

        console.log('Generated country dots:', dotsData.length);

        // Functions and mappings are now defined globally above

        console.log('Creating Globe object...');
        console.log('Globe library available:', typeof Globe !== 'undefined');

        if (typeof Globe === 'undefined') {
          console.error('Globe library not loaded!');
          document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: Arial, sans-serif;"><h2>Error Loading Globe</h2><p>Globe.gl library not found. Please check your internet connection.</p></div>';
          return;
        }

        world = new Globe(document.getElementById('globeViz'))
          // Set background color to light blue
          .backgroundColor('#F8F9FD')
          .showGlobe(true)
          .globeImageUrl('data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#E8EEFf"/></svg>'))
          .showAtmosphere(false)
          // Add atmosphere for bright themeimage.pngimage.png
          .hexPolygonsData(countries.features.filter(d => d.properties.ISO_A2 !== 'AQ'))
          .hexPolygonResolution(3)
          .hexPolygonMargin(0.2)
          .hexPolygonAltitude(0.006)
          .hexPolygonUseDots(true)
          .hexPolygonCurvatureResolution(0)
          .enablePointerInteraction(true)
          // Track pointer position for tooltip placement
          .onZoom(() => false) // Disable zoom functionality
          // Add invisible polygons for gap coverage
          .polygonsData(countries.features.filter(d => d.properties.ISO_A2 !== 'AQ'))
          .polygonAltitude(0.012) // slightly above hex layer for reliable hover in gaps
          .polygonCapColor(() => 'rgba(0, 0, 0, 0)') // Completely transparent
          .polygonSideColor(() => 'rgba(0, 0, 0, 0)') // Completely transparent
          .polygonStrokeColor(() => 'rgba(0, 0, 0, 0)') // Completely transparent
          .hexPolygonColor(({ properties: d }) => {
            const continent = getContinentForCountry(d.ISO_A3, d.ADMIN);
            const countryName = d.ADMIN; // Use name to avoid '-99' ISO collisions
            const colors = {
              base: '#B4BBF0',            // Default
              hoverContinent: '#3E4FE0',  // Continent hover
              hoverCountry: '#3E4FE0',    // Country hover (smooth blue)
              selectedCountry: '#3E4FE0', // Country selected (deep blue)
              selectedContinent: '#3E4FE0',// Continent selected (royal blue)
              nonSelectable: '#B4BBF0'    // Non-selectable countries (gray)
            };

            // Check if country is non-selectable first
            if (!isCountrySelectable(d.ISO_A3, d.ADMIN)) {
              return colors.nonSelectable;
            }

            // Priority: selected country > selected continent > hovered country > hovered continent > base
            if (selectedCountry && selectedCountry.properties && selectedCountry.properties.ADMIN === countryName) {
              return colors.selectedCountry;
            }
            if (selectedContinent && continent === selectedContinent) {
              return colors.selectedContinent;
            }
            if (hoveredCountry && hoveredCountry.properties && hoveredCountry.properties.ADMIN === countryName) {
              return colors.hoverCountry;
            }
            if (hoveredContinent && continent === hoveredContinent) {
              return colors.hoverContinent;
            }
            return colors.base;
          })
          .onHexPolygonHover((polygon) => {
            // Clear any existing timeout
            if (hoverTimeout) {
              clearTimeout(hoverTimeout);
              hoverTimeout = null;
            }

            if (polygon) {
              // Mouse entered a polygon
              const newContinent = getContinentForCountry(polygon.properties.ISO_A3, polygon.properties.ADMIN);
              if (hoveredContinent !== newContinent) {
                hoveredContinent = newContinent;
                hoveredCountry = polygon;
                // Stop auto rotation when hovering
                stopAutoRotation();
                updateHexPolygonColors();
                // Tooltip handled by Globe label
              }
            } else {
              // Mouse left polygon - add small delay before clearing
              hoverTimeout = setTimeout(() => {
                hoveredContinent = null;
                hoveredCountry = null;
                updateHexPolygonColors();
                // Schedule auto-rotation resume after 2s to avoid shake
                resumeAutoRotationAfterDelay(1000);
                hoverTimeout = null;
              }, 100);
            }
          })
          .hexPolygonLabel(({ properties: d }) => {
            const continent = getContinentForCountry(d.ISO_A3, d.ADMIN);
            const isSelectable = isCountrySelectable(d.ISO_A3, d.ADMIN);
            const statusText = isSelectable ? '' : '<div style="color:#ff6b6b; font-size: 10px; margin-top: 2px;">• Not selectable</div>';
            
            return `<div style="font-family: Inter, Arial, sans-serif; font-size: 12px; line-height: 1.4;">
        <div style="font-weight:600; color:${isSelectable ? '#2D3FCC' : '#888888'};">${d.ADMIN}</div>
        <div style="color:#667085;">Continent: ${continent}</div>
        ${statusText}
      </div>`;
          })
          .onHexPolygonClick((polygon) => {
            if (polygon) {
              // Check if the country is selectable
              if (!isCountrySelectable(polygon.properties.ISO_A3, polygon.properties.ADMIN)) {
                console.log(`Country ${polygon.properties.ADMIN} (${polygon.properties.ISO_A3}) is not selectable`);
                return; // Do nothing if country is not selectable
              }

              // Stop auto rotation when user interacts
              stopAutoRotation();

              // Clear hover states
              hoveredCountry = null;
              hoveredContinent = null;

              // Select the clicked country
              selectedCountry = polygon; // store full feature with ADMIN
              // Auto-select the continent of the selected country
              selectedContinent = getContinentForCountry(polygon.properties.ISO_A3, polygon.properties.ADMIN);
              console.log(`Selected country: ${polygon.properties.ADMIN} in continent: ${selectedContinent}`);

              // Update globe colors
              world.hexPolygonsData(countries.features.filter(d => d.properties.ISO_A2 !== 'AQ'));

              // Update UI panels
              updateUIFromGlobeSelection();

              // Update continent badge panel (globe click path)
              try {
                const container = document.getElementById('continent-tooltips');
                if (container) {
                  container.querySelectorAll('.continent-tooltip').forEach(el => { el.style.display = 'none'; });
                  const id = selectedContinent.replace(/\s+/g, '-');
                  const el = document.getElementById(id);
                  if (el) el.style.display = 'block';
                }
              } catch (_) { }

              // Focus on country with animation (no zoom)
              console.log('Focusing on country:', polygon.properties.ADMIN);
              animateToCountry(polygon);

              // Resume auto rotation after 2 seconds
              resumeAutoRotationAfterDelay(1000);

              // Tooltip handled by Globe label
            }
          })
          // Add polygon hover for gap coverage
          .onPolygonHover(hoverD => {
            if (hoverD) {
              // Stop auto rotation when hovering
              stopAutoRotation();
              // Set hovered country and continent
              hoveredCountry = hoverD;
              hoveredContinent = getContinentForCountry(hoverD.properties.ISO_A3, hoverD.properties.ADMIN);
              // Update colors to show hover effect
              updateHexPolygonColors();
              // Tooltip handled by Globe label
            } else {
              // Resume rotation when hover is released
              hoveredCountry = null;
              hoveredContinent = null;
              updateHexPolygonColors();
              // Schedule auto-rotation resume after 2s to avoid shake
              resumeAutoRotationAfterDelay(1000);
            }
          })
          .onPolygonClick(clickedD => {
            if (clickedD) {
              // Check if the country is selectable
              if (!isCountrySelectable(clickedD.properties.ISO_A3, clickedD.properties.ADMIN)) {
                console.log(`Country ${clickedD.properties.ADMIN} (${clickedD.properties.ISO_A3}) is not selectable`);
                return; // Do nothing if country is not selectable
              }

              // Stop auto rotation when user interacts
              stopAutoRotation();

              // Clear hover states
              hoveredCountry = null;
              hoveredContinent = null;

              // Select the clicked country
              selectedCountry = clickedD; // store full feature with ADMIN
              // Auto-select the continent of the selected country
              selectedContinent = getContinentForCountry(clickedD.properties.ISO_A3, clickedD.properties.ADMIN);
              console.log(`Selected country: ${clickedD.properties.ADMIN} in continent: ${selectedContinent}`);

              // Update globe colors
              updateHexPolygonColors();

              // Update UI panels
              updateUIFromGlobeSelection();

              // Update continent badge panel (polygon click path)
              try {
                const container = document.getElementById('continent-tooltips');
                if (container) {
                  container.querySelectorAll('.continent-tooltip').forEach(el => { el.style.display = 'none'; });
                  const id = selectedContinent.replace(/\s+/g, '-');
                  const el = document.getElementById(id);
                  if (el) el.style.display = 'block';
                }
              } catch (_) { }

              // Focus on country with animation (no zoom)
              console.log('Focusing on country:', clickedD.properties.ADMIN);
              animateToCountry(clickedD);

              // Resume auto rotation after 2 seconds
              resumeAutoRotationAfterDelay(1000);

              // Show tooltip for the selected continent
              // showContinentTooltip(selectedContinent);
            }
          });

        // Add bright lighting and material effects after globe is created
        console.log('Adding bright lighting and material effects...');
        try {
          // Access the Three.js scene through Globe.gl's internal structure
          const scene = world.scene();
          if (scene && window.THREE) {
            // Access the Three.js scene through Globe.gl's internal structure
            // Set scene background to white
            // scene.background = new window.THREE.Color(0xffffff);
            console.log('Scene background set to white');

            // Add bright ambient light
            // const ambientLight = new window.THREE.AmbientLight(0xffffff, 0.8);
            // scene.add(ambientLight);

            // // Add bright directional light for shadow effect
            // const dLight = new window.THREE.DirectionalLight(0xffffff, 1.2);
            // dLight.position.set(1, 1, 1);
            // scene.add(dLight);

            // // Add additional directional light for even brightness
            // const dLight2 = new window.THREE.DirectionalLight(0xffffff, 0.6);
            // dLight2.position.set(-1, 1, -1);
            // scene.add(dLight2);

            // Set globe material for bright white theme
            const globeMaterial = world.globeMaterial();
            if (globeMaterial) {
              // globeMaterial.color = new window.THREE.Color(0xffffff);
              // globeMaterial.emissive = new window.THREE.Color(0x000000);
              // globeMaterial.emissiveIntensity = 0.0;
              // globeMaterial.shininess = 100;
              // globeMaterial.specular = new window.THREE.Color(0x222222);
              // globeMaterial.needsUpdate = true;
              console.log('Globe material set to white');
            } else {
              console.log('Could not access globe material');
            }

            console.log('Bright lighting and material effects added successfully');
          } else {
            console.log('Three.js not available or scene not accessible');
          }
          // Make camera movement smooth like in index.js by enabling damping
          const controls = world.controls();
          if (controls) {
            controls.enableDamping = true;
            controls.dampingFactor = 0.06;
            controls.autoRotate = false; // will be toggled by start/stop helpers
            controls.autoRotateSpeed = 1;
            controls.rotateSpeed = 0.5; // Slower manual rotation for smoother control

            // Disable zoom functionality
            controls.enableZoom = false;

            // Force controls to update to ensure camera lights are properly oriented
            controls.update();
          }
        } catch (error) {
          console.log('Could not add lighting effects:', error);
        }

        // Initialize with North America selected
        console.log('Initializing globe with North America selected...');

        // Set initial view to focus on North America
        console.log('Setting initial camera position to North America...');
        world.pointOfView({ lat: 45, lng: -100, altitude: 1.5 }, 0);

        // Initialize UI components after globe is created
        console.log('Initializing UI...');
        initializeUI();
        // Show North America badge by default
        try {
          const container = document.getElementById('continent-tooltips');
          if (container) {
            container.querySelectorAll('.continent-tooltip').forEach(el => { el.style.display = 'none'; });
            const el = document.getElementById('North-America');
            if (el) el.style.display = 'block';
          }
        } catch (_) { }
        // Hide the countries list panel (we'll show continent badge instead)
        (function hideCountryItems() {
          try {
            const panel = document.getElementById('countryPanel');
            if (panel) panel.style.display = 'none';
            const list = document.getElementById('countryList');
            if (list) list.style.display = 'none';
          } catch (_) { }
        })();

        // Limit vertical movement (lat bounds) by clamping in our POV updates
        const originalPointOfView = world.pointOfView.bind(world);
        world.pointOfView = function (pov, ms) {
          // No latitude clamping – pass through as-is
          return originalPointOfView(pov, ms);
        };

        // Start auto-rotation by default
        console.log('Starting auto-rotation...');
        startAutoRotation();

        // Function to start auto rotation
        function startAutoRotation() {
          const controls = world.controls && world.controls();
          if (controls) {
            controls.autoRotate = true;
          }
        }

        // Function to stop auto rotation
        function stopAutoRotation() {
          const controls = world.controls && world.controls();
          if (controls) {
            controls.autoRotate = false;
          }
          if (resumeRotationTimeout) {
            clearTimeout(resumeRotationTimeout);
            resumeRotationTimeout = null;
          }
        }

        // Function to resume auto rotation after a delay
        function resumeAutoRotationAfterDelay(delay = 1000) {
          // Clear any existing timeout
          if (resumeRotationTimeout) {
            clearTimeout(resumeRotationTimeout);
          }

          // Set new timeout to resume rotation
          resumeRotationTimeout = setTimeout(() => {
            if (autoRotate) {
              startAutoRotation();
            }
            resumeRotationTimeout = null;
          }, delay);
        }

        // Function to update UI panels when user selects from globe
        function updateUIFromGlobeSelection() {
          // Update continent panel selection
          document.querySelectorAll('.global_region-item').forEach(item => {
            item.classList.toggle('w--current', item.textContent === selectedContinent);
          });

          // Update country panel
          updateCountryList();

          // Update country selection in the list
          document.querySelectorAll('.country-item').forEach(item => {
            item.classList.toggle('w--current',
              selectedCountry && item.textContent === selectedCountry.properties.ADMIN
            );
          });
        }

        // UI Management Functions
        function initializeUI() {
          // Initialize continent selector
          const continentList = document.getElementById('continentList');
          const continents = ['North America', 'South America', 'Europe', 'Asia', 'Middle East', 'Africa'];

          continents.forEach(continent => {
            const item = document.createElement('div');
            item.className = 'global_region-item';
            item.textContent = continent;
            if (continent === selectedContinent) {
              item.classList.add('w--current');
            }
            item.addEventListener('click', () => selectContinent(continent));
            continentList.appendChild(item);
          });

          // Initialize country list
          updateCountryList();

          // Controls removed as requested
        }

        function selectContinent(continent) {
          console.log(`Selecting continent: ${continent}`);
          selectedContinent = continent;
          selectedCountry = null; // Clear country selection

          // Stop auto rotation when user interacts
          stopAutoRotation();

          // Update UI
          document.querySelectorAll('.global_region-item').forEach(item => {
            item.classList.toggle('w--current', item.textContent === continent);
          });

          // Update continent badge panel
          try {
            const container = document.getElementById('continent-tooltips');
            if (container) {
              container.querySelectorAll('.continent-tooltip').forEach(el => { el.style.display = 'none'; });
              // Match ID format by replacing spaces with dashes
              const id = continent.replace(/\s+/g, '-');
              const el = document.getElementById(id);
              if (el) el.style.display = 'block';
            }
          } catch (_) { }

          // Update globe
          updateHexPolygonColors();
          updateCountryList();

          // Focus on continent with animation (no zoom)
          animateToContinent(continent);

          // Tooltip handled by Globe label

          // Resume auto rotation after 2 seconds
          resumeAutoRotationAfterDelay(1000);
        }

        function selectCountry(country) {
          // Check if the country is selectable
          if (!isCountrySelectable(country.properties.ISO_A3, country.properties.ADMIN)) {
            console.log(`Country ${country.properties.ADMIN} (${country.properties.ISO_A3}) is not selectable`);
            return; // Do nothing if country is not selectable
          }

          selectedCountry = country;
          selectedContinent = getContinentForCountry(country.properties.ISO_A3, country.properties.ADMIN);

          // Stop auto rotation when user interacts
          stopAutoRotation();

          // Update UI
          document.querySelectorAll('.global_region-item').forEach(item => {
            item.classList.toggle('w--current', item.textContent === selectedContinent);
          });

          // Update continent badge panel
          try {
            const container = document.getElementById('continent-tooltips');
            if (container) {
              container.querySelectorAll('.continent-tooltip').forEach(el => { el.style.display = 'none'; });
              const id = selectedContinent.replace(/\s+/g, '-');
              const el = document.getElementById(id);
              if (el) el.style.display = 'block';
            }
          } catch (_) { }

          document.querySelectorAll('.country-item').forEach(item => {
            item.classList.toggle('w--current', item.textContent === country.properties.ADMIN);
          });

          // Update globe
          updateHexPolygonColors();

          // Focus on country with animation (no zoom)
          animateToCountry(country);

          // Tooltip handled by Globe label

          // Resume auto rotation after 2 seconds
          resumeAutoRotationAfterDelay(1000);
        }

        // Tooltip helpers
        function showContinentTooltip(continent) {
          try {
            const container = document.getElementById('continent-tooltips');
            if (!container) return;

            // Hide all tooltips first
            container.querySelectorAll('.continent-tooltip').forEach(el => {
              el.style.display = 'none';
              el.style.position = 'absolute';
              el.style.left = '';
              el.style.top = '';
              el.style.transform = '';
            });

            // Show the matching tooltip (normalize text)
            const normalized = String(continent || '').trim();
            const tip = container.querySelector('.continent-tooltip[data-continent="' + normalized + '"]');
            if (tip) {
              // Position near the continent center on screen
              const p = getContinentScreenPosition(normalized);
              if (p) {
                tip.style.left = p.x + 'px';
                tip.style.top = p.y + 'px';
                tip.style.transform = 'translate(-50%, -120%)';
              }
              tip.style.display = 'block';
            }

            // Auto-hide after a short delay
            setTimeout(() => {
              if (tip) tip.style.display = 'none';
            }, 2000);
          } catch (e) {
            console.log('Tooltip error:', e);
          }
        }

        // Show tooltip near the current mouse pointer
        function showContinentTooltipAtPointer(continent) {
          try {
            const container = document.getElementById('continent-tooltips');
            if (!container) return;

            container.querySelectorAll('.continent-tooltip').forEach(el => {
              el.style.display = 'none';
              el.style.position = 'absolute';
            });

            const normalized = String(continent || '').trim();
            const tip = container.querySelector('.continent-tooltip[data-continent="' + normalized + '"]');
            if (tip) {
              // Position slightly below the last known mouse position.
              // If we don't have a valid mouse position yet, fall back to continent center.
              const hasMouse = lastMousePos && (lastMousePos.x !== 0 || lastMousePos.y !== 0);
              const offsetY = 18;
              if (hasMouse) {
                tip.style.left = lastMousePos.x + 'px';
                tip.style.top = (lastMousePos.y + offsetY) + 'px';
                tip.style.transform = 'translate(-50%, 0)';
              } else {
                const p = getContinentScreenPosition(normalized);
                if (p) {
                  tip.style.left = p.x + 'px';
                  tip.style.top = (p.y + offsetY) + 'px';
                  tip.style.transform = 'translate(-50%, 0)';
                }
              }
              tip.style.display = 'block';
            }

            // Do not auto-hide while hovering; hiding is handled on hover-out
          } catch (_) { }
        }

        function getContinentScreenPosition(continent) {
          try {
            const centers = {
              'North America': { lat: 45, lng: -100 },
              'South America': { lat: -15, lng: -60 },
              'Europe': { lat: 50, lng: 10 },
              'Asia': { lat: 35, lng: 100 },
              'Africa': { lat: 0, lng: 20 },
              'Middle East': { lat: 30, lng: 50 }
            };
            const c = centers[continent];
            if (!c || !world || !window.THREE) return null;
            const scene = world.scene && world.scene();
            const camera = world.camera && world.camera();
            const renderer = world.renderer && world.renderer();
            if (!scene || !camera || !renderer) return null;

            // Convert lat/lng to 3D position on globe surface
            const phi = (90 - c.lat) * (Math.PI / 180);
            const theta = (c.lng + 180) * (Math.PI / 180);
            const radius = (world.getGlobeRadius && world.getGlobeRadius()) || 100;
            const pos = new window.THREE.Vector3(
              -radius * Math.sin(phi) * Math.cos(theta),
              radius * Math.cos(phi),
              radius * Math.sin(phi) * Math.sin(theta)
            );

            const projected = pos.clone().project(camera);
            const canvas = renderer.domElement;
            const x = (projected.x * 0.5 + 0.5) * canvas.clientWidth;
            const y = (-projected.y * 0.5 + 0.5) * canvas.clientHeight;
            return { x, y };
          } catch (_) {
            return null;
          }
        }

        function updateCountryList() {
          const countryList = document.getElementById('countryList');
          const continentTitle = document.getElementById('continentTitle');

          continentTitle.textContent = selectedContinent;
          countryList.innerHTML = '';

          // Get countries for selected continent, excluding non-selectable ones
          const continentCountries = countries.features.filter(country => {
            const continent = getContinentForCountry(country.properties.ISO_A3, country.properties.ADMIN);
            const isInContinent = continent === selectedContinent;
            const isSelectable = isCountrySelectable(country.properties.ISO_A3, country.properties.ADMIN);
            return isInContinent && isSelectable;
          });

          console.log(`Found ${continentCountries.length} selectable countries for continent: ${selectedContinent}`);
          console.log('Countries:', continentCountries.map(c => `${c.properties.ADMIN} (${c.properties.ISO_A3})`));

          continentCountries.forEach(country => {
            const item = document.createElement('div');
            item.className = 'country-item';
            item.textContent = country.properties.ADMIN;
            if (selectedCountry && selectedCountry.properties.ISO_A3 === country.properties.ISO_A3) {
              item.classList.add('w--current');
            }
            item.addEventListener('click', () => selectCountry(country));
            countryList.appendChild(item);
          });
        }

        function animateToContinent(continent) {
          console.log('animateToContinent called with:', continent);
          // Predefined center coordinates for each continent (keeping current altitude)
          const continentCenters = {
            'North America': { lat: 45, lng: -100 },
            'South America': { lat: -15, lng: -60 },
            'Europe': { lat: 50, lng: 10 },
            'Asia': { lat: 35, lng: 100 },
            'Middle East': { lat: 30, lng: 50 },
            'Africa': { lat: 0, lng: 20 }
          };

          const center = continentCenters[continent];
          if (center) {
            // Get current altitude to maintain zoom level
            const currentPOV = world.pointOfView();
            console.log(`Animating to ${continent}:`, center, 'Current POV:', currentPOV);
            world.pointOfView({
              lat: center.lat,
              lng: center.lng,
              altitude: currentPOV.altitude // Keep current altitude (no zoom)
            }, 1000);
          } else {
            console.log('No center found for continent:', continent);
          }
        }

        function animateToCountry(country) {
          console.log('animateToCountry called with:', country.properties.ADMIN);
          // Calculate center of country by averaging all coordinates
          const coords = country.geometry.coordinates;
          let totalLat = 0, totalLng = 0, pointCount = 0;

          if (country.geometry.type === 'Polygon') {
            coords[0].forEach(coord => {
              totalLng += coord[0];
              totalLat += coord[1];
              pointCount++;
            });
          } else if (country.geometry.type === 'MultiPolygon') {
            coords.forEach(polygon => {
              polygon[0].forEach(coord => {
                totalLng += coord[0];
                totalLat += coord[1];
                pointCount++;
              });
            });
          }

          if (pointCount > 0) {
            const centerLat = totalLat / pointCount;
            const centerLng = totalLng / pointCount;

            // Get current altitude to maintain zoom level
            const currentPOV = world.pointOfView();
            console.log(`Animating to ${country.properties.ADMIN}:`, { lat: centerLat, lng: centerLng }, 'Current POV:', currentPOV);
            world.pointOfView({
              lat: centerLat,
              lng: centerLng,
              altitude: currentPOV.altitude // Keep current altitude (no zoom)
            }, 1000);
          } else {
            console.log('No coordinates found for country:', country.properties.ADMIN);
          }
        }

        // Controls removed as requested

        // Add container resize handler for responsiveness
        function handleContainerResize(rect) {
          if (world) {
            // Update renderer size
            const renderer = world.renderer();
            if (renderer) {
              renderer.setSize(rect.width, rect.height);
              renderer.setPixelRatio(window.devicePixelRatio);
            }
            
            // Update camera aspect ratio
            const camera = world.camera();
            if (camera) {
              camera.aspect = rect.width / rect.height;
              camera.updateProjectionMatrix();
            }
            
            // Update controls if available to recalibrate mouse coordinates
            const controls = world.controls();
            if (controls) {
              // Force controls to update with new dimensions
              controls.update();
              
              // Reset the controls' internal size calculations
              if (controls.domElement) {
                // Trigger a synthetic resize on the controls' DOM element
                const resizeEvent = new Event('resize');
                controls.domElement.dispatchEvent(resizeEvent);
              }
            }
            
            // Force Globe.gl to refresh its internal coordinate system
            // Some Globe.gl versions have a refresh method, try it if available
            if (typeof world.refresh === 'function') {
              world.refresh();
            }
            
            // Alternative: Force re-initialization of internal coordinate mapping
            // by setting the size explicitly through Globe.gl's width/height methods
            if (typeof world.width === 'function' && typeof world.height === 'function') {
              world.width(rect.width).height(rect.height);
            }
            
            // Force recalibration of mouse coordinate system
            // by accessing the canvas and triggering a coordinate system reset
            const canvas = renderer.domElement;
            if (canvas) {
              // Update canvas size attributes to ensure proper coordinate mapping
              canvas.width = rect.width * window.devicePixelRatio;
              canvas.height = rect.height * window.devicePixelRatio;
              canvas.style.width = rect.width + 'px';
              canvas.style.height = rect.height + 'px';
              
              // Trigger a mouse move event to recalibrate the coordinate system
              const rect2 = canvas.getBoundingClientRect();
              const syntheticEvent = new MouseEvent('mousemove', {
                clientX: rect2.left + rect2.width / 2,
                clientY: rect2.top + rect2.height / 2,
                bubbles: true
              });
              canvas.dispatchEvent(syntheticEvent);
            }
            
            // Reset mouse tracking variables to ensure they're in sync
            lastMousePos = { x: 0, y: 0 };
            
            console.log(`Globe container resized to: ${rect.width}x${rect.height}`);
          }
        }

        // Setup ResizeObserver to monitor container size changes
        const container = document.getElementById('globeViz');
        if (container) {
          // Debounce mechanism for resize events
          let resizeTimeout;
          function debouncedContainerResize(entries) {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
              const entry = entries[0];
              if (entry) {
                const rect = entry.contentRect;
                handleContainerResize(rect);
              }
            }, 50); // 50ms debounce for better responsiveness
          }

          // Check if ResizeObserver is supported
          if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(debouncedContainerResize);
            resizeObserver.observe(container);
            console.log('ResizeObserver set up to monitor globe container size changes');
          } else {
            // Fallback to window resize for older browsers
            function fallbackWindowResize() {
              const rect = container.getBoundingClientRect();
              handleContainerResize(rect);
            }
            
            let fallbackTimeout;
            function debouncedFallbackResize() {
              clearTimeout(fallbackTimeout);
              fallbackTimeout = setTimeout(fallbackWindowResize, 100);
            }
            
            window.addEventListener('resize', debouncedFallbackResize);
            console.log('Fallback window resize handler added (ResizeObserver not supported)');
          }
        }

      } // End of initializeGlobe function

    }); // End of DOMContentLoaded
