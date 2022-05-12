from flask import Flask, jsonify, render_template, request, Markup
from cosmos_create_db import add_user_to_db, get_related_message
import json

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/makePost', methods=['POST'])
def makePost():
    username = request.form['usernameTbx']
    message = request.form['msgTbx']
    lat = request.form['latTbx']
    long = request.form['longTbx']
    danger = int(request.form['dangerLevel'])
    
    add_user_to_db(username, long, lat, message, danger)
    print('User created')
    return render_template('index.html')

@app.route('/getPosts', methods=['GET'])
def getPosts():
    # lat = int(request.form['latCenter'])
    # long = int(request.form['longCenter'])
    # time = int(request.form['selectPostTime'])
    lat = int(request.args.get('latCenter', ''))
    long = int(request.args.get('longCenter', ''))
    time = int(request.args.get('selectPostTime', ''))
    response = get_related_message(long, lat, time_range = time)
    print(time)
    # print(response)
    # posts = [[user['lastName'], user['latitude'], user['longitude'], user['message']] for user in response]
    # print(posts)
    data = json.dumps(response)
    res = ''
    for user in response:
        name = user['lastName']
        lat = user['latitude']
        long = user['longitude']
        msg = user['message']
        new_line = '\nUser: ' + name + '\n Latitude: ' + str(lat) + '\n Longitude: ' \
            + str(long) + '\n Message: ' + str(msg) + '\n'
        res += new_line
    res = Markup("<br/>".join(res.split("\n")))
    return render_template('index.html', postData = res)



if __name__ == '__main__':
   app.run()