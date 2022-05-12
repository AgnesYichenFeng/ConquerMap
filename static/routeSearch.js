var map, searchURL, routeURL, points, datasource, routeLine;

var weatherAlongRouteUrl = 'https://{azMapsDomain}/weather/route/json?api-version=1.0&query={query}';
var currentConditionsUrl = 'https://{azMapsDomain}/weather/currentConditions/json?api-version=1.0&query={query}';

function GetMap() {
    //Initialize a map instance.
    map = new atlas.Map('myMap', {
        center: [-76.5019, 42.4440],  // 42.4440° N, 76.5019° W
        zoom: 11,
        view: 'Auto',

        //Add authentication details for connecting to Azure Maps.
        authOptions: {
            //Alternatively, use an Azure Maps key. Get an Azure Maps key at https://azure.com/maps. NOTE: The primary key should be used as the key.
            authType: 'subscriptionKey',
            subscriptionKey: '6r3P-UXjCnjDesZJlRsIiDJz3L_joI3EPtNNyOPpWbM'
        }
  });

  //Use MapControlCredential to share authentication between a map control and the service module.
  var pipeline = atlas.service.MapsURL.newPipeline(new atlas.service.MapControlCredential(map));

  //Create an instance of pthe SearchURL client.
  searchURL = new atlas.service.SearchURL(pipeline, atlas.getDomain());

  //Create an instance of the RouteURL client.
  routeURL = new atlas.service.RouteURL(pipeline, atlas.getDomain());

  //Wait until the map resources are ready.
  map.events.add('ready', function () {

    //Create a data source and add it to the map.
    datasource = new atlas.source.DataSource();
    map.sources.add(datasource);

    //Add a layer for rendering the weather data points.
    var waypointLayer = new atlas.layer.BubbleLayer(datasource, null, {
        //color: ['get', 'color'],
        filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']] //Only render Point or MultiPoints in this layer.
    });

    map.layers.add([
        //Add a layer for rendering line data.
        new atlas.layer.LineLayer(datasource, null, {
            strokeColor: 'rgb(0, 204, 153)',
            strokeWidth: 5,
            filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'MultiLineString']]	//Only render LineString or MultiLineString in this layer.
        }),

        waypointLayer
    ]);

    // Add mouseover events to the waypoint layer.
    map.events.add('mouseover', waypointLayer, featureClicked);

    // Add click event: click and shoe the weather and position
    map.events.add('click', getWeatherForPoint);

    // Create a popup but leave it closed so we can update it and display it later.
    popup = new atlas.Popup();
  });
}

function calculateRoute() {
    datasource.clear();

    var start = document.getElementById('startTbx').value;
    var end = document.getElementById('endTbx').value;

    if (start == '' || end == '') {
        alert('Invalid waypoint point specified.');
        return;
    }

    //Geocode the start waypoint.
    geocodeQuery(start, function (startPoint) {
        if (!startPoint) {
            alert('Unable to geocode start waypoint.');
            return;
        }

        //Geocode the end waypoint.
        geocodeQuery(end, function (endPoint) {
            if (!endPoint) {
                alert('Unable to geocode end waypoint.');
                return;
            }
            routeURL.calculateRouteDirections(atlas.service.Aborter.timeout(3000), [startPoint, endPoint], {
                maxAlternatives: 0,
                instructionsType: 'text',
                    traffic: true
                }).then(r => {
                if (r && r.routes && r.routes.length > 0) {
                    var route = r.routes[0];
                    var routeCoordinates = [];
                    for (var legIndex = 0; legIndex < route.legs.length; legIndex++) {
                        var leg = route.legs[legIndex];

                        //Convert the route point data into a format that the map control understands.
                        var legCoordinates = leg.points.map(function (point) {
                            return [point.longitude, point.latitude];
                        });

                        //Combine the route point data for each route leg together to form a single path.
                        routeCoordinates = routeCoordinates.concat(legCoordinates);
                    }

                    //Create a line from the route path points and add it to the data source.
                    routeLine = new atlas.data.LineString(routeCoordinates);

                    //Display the route line on the map.
                    datasource.add(routeLine);

                    //Have the map focus on the route. 
                    map.setCamera({
                        bounds: atlas.data.BoundingBox.fromData(routeLine),
                        padding: 40
                    });

                    var waypoints = [];
                    var alongRouteWaypoints = [];

                    var heading = 0;

                    //Loop through up to 60 instructions and create waypoints.
                    //Capture the waypoint information needed for the weather along route API which is "latitude,longitude,ETA (in minutes),heading".
                    var len = Math.min(route.guidance.instructions.length, 60);

                    for (var i = 0; i < len; i++) {
                        var ins = route.guidance.instructions[i];

                        var timeInMinutes = Math.round(ins.travelTimeInSeconds / 60);

                        //Don't get weather for instructions that are more than two hours away from the start of the route.
                        if (timeInMinutes > 120) {
                            break;
                        }

                        var pos = [ins.point.longitude, ins.point.latitude];

                        waypoints.push(new atlas.data.Feature(new atlas.data.Point(pos), ins));

                        //Calculate the heading.
                        if (i < route.guidance.instructions.length - 1) {
                            var ins2 = route.guidance.instructions[i + 1];
                            heading = Math.round(atlas.math.getHeading(pos, [ins2.point.longitude, ins2.point.latitude]));
                        }

                        alongRouteWaypoints.push(`${ins.point.latitude},${ins.point.longitude},${timeInMinutes},${heading}`);
                    }

                    //Get weather data.
                    var requestUrl = weatherAlongRouteUrl.replace('{query}', alongRouteWaypoints.join(':'));

                    processRequest(requestUrl).then(response => {
                        if (response && response.waypoints && response.waypoints.length === waypoints.length) {

                            //Combine the weather data in with each waypoint.
                            for (var i = 0, len = response.waypoints.length; i < len; i++) {
                                Object.assign(waypoints[i].properties, response.waypoints[i]);
                            }

                            //Render the waypoints on the map.
                            datasource.add(waypoints);
                        }
                    });
                }
            });
        });
    });
}

function processRequest(url) {
    //This is a reusable function that sets the Azure Maps platform domain, sings the request, and makes use of any transformRequest set on the map.
    return new Promise((resolve, reject) => {
        //Replace the domain placeholder to ensure the same Azure Maps cloud is used throughout the app.
        url = url.replace('{azMapsDomain}', atlas.getDomain());

        //Get the authentication details from the map for use in the request.
        var requestParams = map.authentication.signRequest({ url: url });

        //Transform the request.
        var transform = map.getServiceOptions().tranformRequest;
        if (transform) {
            requestParams = transform(url);
        }

        fetch(requestParams.url, {
            method: 'GET',
            mode: 'cors',
            headers: new Headers(requestParams.headers)
        })
            .then(r => r.json(), e => reject(e))
            .then(r => {
                resolve(r);
            }, e => reject(e));
    });
}

//Geocode the query and return the first coordinate.
function geocodeQuery(query, callback) {
    if (callback) {
        searchURL.searchAddress(atlas.service.Aborter.timeout(3000), query, {
            limit: 1,
            view: 'Auto'
        }).then(results => {
            var data = results.geojson.getFeatures();
            if (data && data.features.length > 0) {
                callback(data.features[0].geometry.coordinates);
            } else {
                callback(null);
            }
        });
    }
}

function featureClicked(e) {
    //Make sure the event occurred on a shape feature.
    if (e.shapes && e.shapes.length > 0) {
        //Get the properties of the feature.
        var properties = e.shapes[0].getProperties();

        //Set the content and position of the popup.
        popup.setOptions({
            //Update the content of the popup.
            content: atlas.PopupTemplate.applyTemplate(properties, {
                sandboxContent: false
            }),

            //Update the position of the popup with the pins coordinate.
            position: e.shapes[0].getCoordinates()
        });

        //Open the popup.
        popup.open(map);
    }
}

function getPoints() {
    datasource.clear();
    // Build the search query
    var radius = 90000;
    var query = document.getElementById('interestTbx').value;
    var lat = document.getElementById('centerLatTbx').value;
    var lon = document.getElementById('centerLonTbx').value;

    searchURL.searchPOI(atlas.service.Aborter.timeout(10000), query, {
        limit: 10,
        lat: Number(lat),
        lon: Number(lon),
        radius: radius,
        view: 'Auto'
    }).then((results) => {
      // Extract GeoJSON feature collection from the response and add it to the datasource
      var data = results.geojson.getFeatures();
      datasource.add(data);

      // set camera to bounds to show the results
      map.setCamera({
        bounds: data.bbox,
        zoom: 10,
        padding: 15
      });
    });
}

function getWeatherForPoint(e) {
    //Close the popup if it is open.
    popup.close();

    // Weather at center
    var weatherTemplate = {
        //The title tag for the popup. 
        title: 'Lat: ' + e.position[1].toString() + ',\nLong: ' + e.position[0].toString() + "\n\nCurrent Condition" ,

        //HTML string template with placeholders for properties of the weather response.
        content: 
            '<img class="weather-icon"  src="/static/images/icons/weather-black/{iconCode}.png"/>' +
            '<div class="weather-content">' +
            '<div class="weather-temp">{temperature/value}&#176;</div>' +                
            'RealFeel®: {realFeelTemperature/value}&#176;C' +
            '<div class="weather-phrase">{phrase}</div>' +
            'Humidity: {relativeHumidity}&#37</div>',

        //Format numbers with two decimal places.
        numberFormat: {
            maximumFractionDigits: 2
        },

        //Since we trust the data being retrieve, don't sandbox the content so that we can use CSS classes.
        sandboxContent: false
    };

    //Request the current conditions weather data and show it in the pop up.
    var requestUrl = currentConditionsUrl.replace('{query}', e.position[1] + ',' + e.position[0]);

    processRequest(requestUrl).then(response => {
        var content;

        if (response && response.results && response.results[0]) {
            //Use the weatherTemplate settings to create templated content for the popup.
            content = atlas.PopupTemplate.applyTemplate(response.results[0], weatherTemplate);
        } else {
            content = '<div style="padding:10px;">Weather data not available for this location.</div>';
        }

        popup.setOptions({
            content: content,
            position: e.position
        });

        popup.open(map);
    });
}

function displayPosts(posts) {
    alert("Hello! I am an alert box!!");
}

// document.getElementById("showPostsButton").addEventListener("click", showPosts);

// function showPosts() {
//     const url = 'http://127.0.0.1:5000/getPosts'
//     fetch(url)
//     .then(response => {
//         alert(response[0]['latitude']);
//         return response.json();
//     })
//     then(json => {
//         console.log(json);
        
//         document.getElementById("myData").innerHTML = JSON.stringify(json)
//     })
//     .catch(function (err) {
//         console.log(err);
//     });
// }

// function displayData(data) {
//     var mainContainer = document.getElementById("myData");
//     for (var i = 0; i < data.length; i++) {
//       var div = document.createElement("div");
//       div.innerHTML = 'Name: ' + data[i].latitude + ' ' + data[i].longitude;
//       mainContainer.appendChild(div);
//     }
//   }