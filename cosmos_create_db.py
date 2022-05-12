from azure.cosmos import exceptions, CosmosClient, PartitionKey
import uuid
import numpy as np
from datetime import datetime, timedelta

def create_user_db():
    """
    create a new user database
    """
    # Initialize the Cosmos client
    endpoint = "https://cs5412db.documents.azure.com:443/"
    key = 'pa1N3UUvNnBsfL1p6xRgVmGn0loHa9jeUQ98xl4Mpwgi7yKAmYYTiM3HGDWLAT8FLSJpVpGTZI0awPY5fPvl4A=='

    # <create_cosmos_client>
    client = CosmosClient(endpoint, key)
    # </create_cosmos_client>

    # Create a database
    # <create_database_if_not_exists>
    database_name = 'User_DataBase'
    database = client.create_database_if_not_exists(id=database_name)
    # </create_database_if_not_exists>

    # Create a container
    # Using a good partition key improves the performance of database operations.
    # <create_container_if_not_exists>
    container_name = 'User'
    container = database.create_container_if_not_exists(
        id=container_name, 
        partition_key=PartitionKey(path="/lastName"),
        offer_throughput=400
    )
    # </create_container_if_not_exists>


    # Add items to the container
    users_to_create = [create_random_user(), create_random_user(), create_random_user()]

    # <create_item>
    for user_item in users_to_create:
        container.create_item(body=user_item)
    # </create_item>

    # Read items (key value lookups by partition key and id, aka point reads)
    # <read_item>
    for user in users_to_create:
        item_response = container.read_item(item=user['id'], partition_key=user['lastName'])
        request_charge = container.client_connection.last_response_headers['x-ms-request-charge']
        print('Read item with id {0}. Operation consumed {1} request units'.format(item_response['id'], (request_charge)))
    # </read_item>


def create_random_user():
    """
    helper function
    create a random user
    """
    random_lastname = ['Zhu', 'Feng', 'Wei', 'Liu', 'Xie', 'Chang'][np.random.randint(0, 5)]
    random_user_item = {
    'id': random_lastname + '_' + str(uuid.uuid4()),
    'lastName': random_lastname,
    'longitude': np.random.uniform(-180.0, 180),
    'latitude': np.random.uniform(-90.0, 90),
    'DateTime': datetime.now().strftime("%Y%m%d%H%M%S"),
    'message': "This is a sample message.",
    'danger_level': np.random.randint(1,5)
}
    return random_user_item

def create_user(lastName, longitude, latitude, message, danger_level = 0):
    """
    helper function
    create a user according to the info given
    """
    user_item = {
    'id': str(lastName) + '_' + str(uuid.uuid4()),
    'lastName': str(lastName),
    'longitude': float(longitude),
    'latitude': float(latitude),
    'DateTime': datetime.now().strftime("%Y%m%d%H%M%S"),
    'message': str(message),
    'danger_level': int(danger_level)
}
    return user_item

def add_user_to_db(lastName, longitude, latitude, message, danger_level = 0):
    """
    add the user to the database given the info
    """
    endpoint = "https://cs5412db.documents.azure.com:443/"
    key = 'pa1N3UUvNnBsfL1p6xRgVmGn0loHa9jeUQ98xl4Mpwgi7yKAmYYTiM3HGDWLAT8FLSJpVpGTZI0awPY5fPvl4A=='
    client = CosmosClient(endpoint, key)
    database = client.get_database_client('User_DataBase')
    container = database.get_container_client('User')
    user_item = create_user(lastName, longitude, latitude, message, danger_level)
    container.create_item(body=user_item)
    item_response = container.read_item(item=user_item['id'], partition_key=user_item['lastName'])
    request_charge = container.client_connection.last_response_headers['x-ms-request-charge']
    print('Read item with id {0}. Operation consumed {1} request units'.format(item_response['id'], (request_charge)))


def get_related_message(longitude, latitude, time_range = 1):
    """
    retrieve related data from db
    return a list of dictionary
    """
    #
    # the actual number of the range needs to be fixed!
    #
    longitude_range = 10
    latitude_range = 10
    long_LB, long_UB = str(longitude - longitude_range), str(longitude + longitude_range)
    lat_LB, lat_UB = str(latitude - latitude_range), str(latitude + latitude_range)
    time_LB, time_UB = str(int((datetime.now() - timedelta(days = time_range)).strftime("%Y%m%d%H%M%S"))), \
        str(int((datetime.now() + timedelta(days = time_range)).strftime("%Y%m%d%H%M%S")))
    query = "SELECT * FROM c WHERE " + long_LB + " < c.longitude AND c.longitude < " + long_UB \
        + " AND " +lat_LB + " < c.latitude AND c.latitude < " + lat_UB \
            + " AND " + time_LB + " < StringToNumber(c.DateTime) AND StringToNumber(c.DateTime)<" + time_UB 
    #print(query)
    endpoint = "https://cs5412db.documents.azure.com:443/"
    key = 'pa1N3UUvNnBsfL1p6xRgVmGn0loHa9jeUQ98xl4Mpwgi7yKAmYYTiM3HGDWLAT8FLSJpVpGTZI0awPY5fPvl4A=='
    client = CosmosClient(endpoint, key)
    database = client.get_database_client('User_DataBase')
    container = database.get_container_client('User')
    items = list(container.query_items(
        query=query,
        enable_cross_partition_query=True
    ))

    request_charge = container.client_connection.last_response_headers['x-ms-request-charge']
    print('Query returned {0} items. Operation consumed {1} request units'.format(len(items), request_charge))
    return items


create_user_db()
add_user_to_db('Chang', 15.37898759, -88.03345, "This is another sample message", 3)
get_related_message(20, -80, time_range = 1)
