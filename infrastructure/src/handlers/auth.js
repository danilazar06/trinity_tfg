"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUserProfile = exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
/**
 * AuthHandler: Post Confirmation Trigger
 * Se ejecuta automáticamente después de que un usuario confirme su registro
 * Crea el perfil del usuario en la tabla UsersTable
 */
const handler = async (event) => {
    console.log('🔐 Post Confirmation Trigger:', JSON.stringify(event, null, 2));
    try {
        const { userAttributes } = event.request;
        const userName = event.userName;
        // Extraer información del usuario desde Cognito
        const userId = userName;
        const email = userAttributes.email;
        const emailVerified = userAttributes.email_verified === 'true';
        // Crear perfil de usuario en DynamoDB
        const userProfile = {
            userId,
            email,
            emailVerified,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: true,
            // Campos opcionales que se pueden actualizar después
            username: email.split('@')[0],
            profilePicture: null,
            preferences: {
                genres: [],
                languages: ['es'],
            },
        };
        // Insertar en UsersTable
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.USERS_TABLE,
            Item: userProfile,
            ConditionExpression: 'attribute_not_exists(userId)', // Evitar duplicados
        }));
        console.log(`✅ Usuario creado exitosamente: ${userId}`);
        // Retornar el evento sin modificaciones (requerido por Cognito)
        return event;
    }
    catch (error) {
        console.error('❌ Error en Post Confirmation:', error);
        // En caso de error, aún debemos retornar el evento
        // para no bloquear el proceso de registro del usuario
        // El usuario podrá registrarse en Cognito, pero su perfil
        // se creará en el primer login si falla aquí
        return event;
    }
};
exports.handler = handler;
/**
 * Función auxiliar para crear perfil de usuario si no existe
 * (puede ser llamada desde otros handlers si es necesario)
 */
const ensureUserProfile = async (userId, email) => {
    try {
        const userProfile = {
            userId,
            email: email || `${userId}@unknown.com`,
            emailVerified: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: true,
            username: userId,
            profilePicture: null,
            preferences: {
                genres: [],
                languages: ['es'],
            },
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.USERS_TABLE,
            Item: userProfile,
            ConditionExpression: 'attribute_not_exists(userId)',
        }));
        console.log(`✅ Perfil de usuario creado: ${userId}`);
        return userProfile;
    }
    catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            console.log(`ℹ️ Usuario ya existe: ${userId}`);
            return null; // Usuario ya existe
        }
        throw error;
    }
};
exports.ensureUserProfile = ensureUserProfile;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImF1dGgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUEyRTtBQUUzRSxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBRTVEOzs7O0dBSUc7QUFDSSxNQUFNLE9BQU8sR0FBbUMsS0FBSyxFQUFFLEtBQW1DLEVBQUUsRUFBRTtJQUNuRyxPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTdFLElBQUk7UUFDRixNQUFNLEVBQUUsY0FBYyxFQUFFLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQztRQUN6QyxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO1FBRWhDLGdEQUFnRDtRQUNoRCxNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUM7UUFDeEIsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQztRQUNuQyxNQUFNLGFBQWEsR0FBRyxjQUFjLENBQUMsY0FBYyxLQUFLLE1BQU0sQ0FBQztRQUUvRCxzQ0FBc0M7UUFDdEMsTUFBTSxXQUFXLEdBQUc7WUFDbEIsTUFBTTtZQUNOLEtBQUs7WUFDTCxhQUFhO1lBQ2IsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1lBQ25DLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtZQUNuQyxRQUFRLEVBQUUsSUFBSTtZQUNkLHFEQUFxRDtZQUNyRCxRQUFRLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0IsY0FBYyxFQUFFLElBQUk7WUFDcEIsV0FBVyxFQUFFO2dCQUNYLE1BQU0sRUFBRSxFQUFFO2dCQUNWLFNBQVMsRUFBRSxDQUFDLElBQUksQ0FBQzthQUNsQjtTQUNGLENBQUM7UUFFRix5QkFBeUI7UUFDekIsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUkseUJBQVUsQ0FBQztZQUNsQyxTQUFTLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFZO1lBQ25DLElBQUksRUFBRSxXQUFXO1lBQ2pCLG1CQUFtQixFQUFFLDhCQUE4QixFQUFFLG9CQUFvQjtTQUMxRSxDQUFDLENBQUMsQ0FBQztRQUVKLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0NBQWtDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFFeEQsZ0VBQWdFO1FBQ2hFLE9BQU8sS0FBSyxDQUFDO0tBRWQ7SUFBQyxPQUFPLEtBQUssRUFBRTtRQUNkLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFdEQsbURBQW1EO1FBQ25ELHNEQUFzRDtRQUN0RCwwREFBMEQ7UUFDMUQsNkNBQTZDO1FBQzdDLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7QUFDSCxDQUFDLENBQUM7QUFsRFcsUUFBQSxPQUFPLFdBa0RsQjtBQUVGOzs7R0FHRztBQUNJLE1BQU0saUJBQWlCLEdBQUcsS0FBSyxFQUFFLE1BQWMsRUFBRSxLQUFjLEVBQUUsRUFBRTtJQUN4RSxJQUFJO1FBQ0YsTUFBTSxXQUFXLEdBQUc7WUFDbEIsTUFBTTtZQUNOLEtBQUssRUFBRSxLQUFLLElBQUksR0FBRyxNQUFNLGNBQWM7WUFDdkMsYUFBYSxFQUFFLEtBQUs7WUFDcEIsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1lBQ25DLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtZQUNuQyxRQUFRLEVBQUUsSUFBSTtZQUNkLFFBQVEsRUFBRSxNQUFNO1lBQ2hCLGNBQWMsRUFBRSxJQUFJO1lBQ3BCLFdBQVcsRUFBRTtnQkFDWCxNQUFNLEVBQUUsRUFBRTtnQkFDVixTQUFTLEVBQUUsQ0FBQyxJQUFJLENBQUM7YUFDbEI7U0FDRixDQUFDO1FBRUYsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUkseUJBQVUsQ0FBQztZQUNsQyxTQUFTLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFZO1lBQ25DLElBQUksRUFBRSxXQUFXO1lBQ2pCLG1CQUFtQixFQUFFLDhCQUE4QjtTQUNwRCxDQUFDLENBQUMsQ0FBQztRQUVKLE9BQU8sQ0FBQyxHQUFHLENBQUMsK0JBQStCLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDckQsT0FBTyxXQUFXLENBQUM7S0FFcEI7SUFBQyxPQUFPLEtBQVUsRUFBRTtRQUNuQixJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssaUNBQWlDLEVBQUU7WUFDcEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsTUFBTSxFQUFFLENBQUMsQ0FBQztZQUMvQyxPQUFPLElBQUksQ0FBQyxDQUFDLG9CQUFvQjtTQUNsQztRQUNELE1BQU0sS0FBSyxDQUFDO0tBQ2I7QUFDSCxDQUFDLENBQUM7QUFqQ1csUUFBQSxpQkFBaUIscUJBaUM1QiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFBvc3RDb25maXJtYXRpb25UcmlnZ2VyRXZlbnQsIFBvc3RDb25maXJtYXRpb25UcmlnZ2VySGFuZGxlciB9IGZyb20gJ2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XHJcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFB1dENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xyXG5cclxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcclxuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XHJcblxyXG4vKipcclxuICogQXV0aEhhbmRsZXI6IFBvc3QgQ29uZmlybWF0aW9uIFRyaWdnZXJcclxuICogU2UgZWplY3V0YSBhdXRvbcOhdGljYW1lbnRlIGRlc3B1w6lzIGRlIHF1ZSB1biB1c3VhcmlvIGNvbmZpcm1lIHN1IHJlZ2lzdHJvXHJcbiAqIENyZWEgZWwgcGVyZmlsIGRlbCB1c3VhcmlvIGVuIGxhIHRhYmxhIFVzZXJzVGFibGVcclxuICovXHJcbmV4cG9ydCBjb25zdCBoYW5kbGVyOiBQb3N0Q29uZmlybWF0aW9uVHJpZ2dlckhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IFBvc3RDb25maXJtYXRpb25UcmlnZ2VyRXZlbnQpID0+IHtcclxuICBjb25zb2xlLmxvZygn8J+UkCBQb3N0IENvbmZpcm1hdGlvbiBUcmlnZ2VyOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICBjb25zdCB7IHVzZXJBdHRyaWJ1dGVzIH0gPSBldmVudC5yZXF1ZXN0O1xyXG4gICAgY29uc3QgdXNlck5hbWUgPSBldmVudC51c2VyTmFtZTtcclxuICAgIFxyXG4gICAgLy8gRXh0cmFlciBpbmZvcm1hY2nDs24gZGVsIHVzdWFyaW8gZGVzZGUgQ29nbml0b1xyXG4gICAgY29uc3QgdXNlcklkID0gdXNlck5hbWU7XHJcbiAgICBjb25zdCBlbWFpbCA9IHVzZXJBdHRyaWJ1dGVzLmVtYWlsO1xyXG4gICAgY29uc3QgZW1haWxWZXJpZmllZCA9IHVzZXJBdHRyaWJ1dGVzLmVtYWlsX3ZlcmlmaWVkID09PSAndHJ1ZSc7XHJcblxyXG4gICAgLy8gQ3JlYXIgcGVyZmlsIGRlIHVzdWFyaW8gZW4gRHluYW1vREJcclxuICAgIGNvbnN0IHVzZXJQcm9maWxlID0ge1xyXG4gICAgICB1c2VySWQsXHJcbiAgICAgIGVtYWlsLFxyXG4gICAgICBlbWFpbFZlcmlmaWVkLFxyXG4gICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICAvLyBDYW1wb3Mgb3BjaW9uYWxlcyBxdWUgc2UgcHVlZGVuIGFjdHVhbGl6YXIgZGVzcHXDqXNcclxuICAgICAgdXNlcm5hbWU6IGVtYWlsLnNwbGl0KCdAJylbMF0sIC8vIFVzZXJuYW1lIHRlbXBvcmFsIGJhc2FkbyBlbiBlbWFpbFxyXG4gICAgICBwcm9maWxlUGljdHVyZTogbnVsbCxcclxuICAgICAgcHJlZmVyZW5jZXM6IHtcclxuICAgICAgICBnZW5yZXM6IFtdLFxyXG4gICAgICAgIGxhbmd1YWdlczogWydlcyddLFxyXG4gICAgICB9LFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBJbnNlcnRhciBlbiBVc2Vyc1RhYmxlXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuVVNFUlNfVEFCTEUhLFxyXG4gICAgICBJdGVtOiB1c2VyUHJvZmlsZSxcclxuICAgICAgQ29uZGl0aW9uRXhwcmVzc2lvbjogJ2F0dHJpYnV0ZV9ub3RfZXhpc3RzKHVzZXJJZCknLCAvLyBFdml0YXIgZHVwbGljYWRvc1xyXG4gICAgfSkpO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgVXN1YXJpbyBjcmVhZG8gZXhpdG9zYW1lbnRlOiAke3VzZXJJZH1gKTtcclxuXHJcbiAgICAvLyBSZXRvcm5hciBlbCBldmVudG8gc2luIG1vZGlmaWNhY2lvbmVzIChyZXF1ZXJpZG8gcG9yIENvZ25pdG8pXHJcbiAgICByZXR1cm4gZXZlbnQ7XHJcblxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZW4gUG9zdCBDb25maXJtYXRpb246JywgZXJyb3IpO1xyXG4gICAgXHJcbiAgICAvLyBFbiBjYXNvIGRlIGVycm9yLCBhw7puIGRlYmVtb3MgcmV0b3JuYXIgZWwgZXZlbnRvXHJcbiAgICAvLyBwYXJhIG5vIGJsb3F1ZWFyIGVsIHByb2Nlc28gZGUgcmVnaXN0cm8gZGVsIHVzdWFyaW9cclxuICAgIC8vIEVsIHVzdWFyaW8gcG9kcsOhIHJlZ2lzdHJhcnNlIGVuIENvZ25pdG8sIHBlcm8gc3UgcGVyZmlsXHJcbiAgICAvLyBzZSBjcmVhcsOhIGVuIGVsIHByaW1lciBsb2dpbiBzaSBmYWxsYSBhcXXDrVxyXG4gICAgcmV0dXJuIGV2ZW50O1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBGdW5jacOzbiBhdXhpbGlhciBwYXJhIGNyZWFyIHBlcmZpbCBkZSB1c3VhcmlvIHNpIG5vIGV4aXN0ZVxyXG4gKiAocHVlZGUgc2VyIGxsYW1hZGEgZGVzZGUgb3Ryb3MgaGFuZGxlcnMgc2kgZXMgbmVjZXNhcmlvKVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGVuc3VyZVVzZXJQcm9maWxlID0gYXN5bmMgKHVzZXJJZDogc3RyaW5nLCBlbWFpbD86IHN0cmluZykgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCB1c2VyUHJvZmlsZSA9IHtcclxuICAgICAgdXNlcklkLFxyXG4gICAgICBlbWFpbDogZW1haWwgfHwgYCR7dXNlcklkfUB1bmtub3duLmNvbWAsXHJcbiAgICAgIGVtYWlsVmVyaWZpZWQ6IGZhbHNlLFxyXG4gICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIGlzQWN0aXZlOiB0cnVlLFxyXG4gICAgICB1c2VybmFtZTogdXNlcklkLFxyXG4gICAgICBwcm9maWxlUGljdHVyZTogbnVsbCxcclxuICAgICAgcHJlZmVyZW5jZXM6IHtcclxuICAgICAgICBnZW5yZXM6IFtdLFxyXG4gICAgICAgIGxhbmd1YWdlczogWydlcyddLFxyXG4gICAgICB9LFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuVVNFUlNfVEFCTEUhLFxyXG4gICAgICBJdGVtOiB1c2VyUHJvZmlsZSxcclxuICAgICAgQ29uZGl0aW9uRXhwcmVzc2lvbjogJ2F0dHJpYnV0ZV9ub3RfZXhpc3RzKHVzZXJJZCknLFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgUGVyZmlsIGRlIHVzdWFyaW8gY3JlYWRvOiAke3VzZXJJZH1gKTtcclxuICAgIHJldHVybiB1c2VyUHJvZmlsZTtcclxuXHJcbiAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgaWYgKGVycm9yLm5hbWUgPT09ICdDb25kaXRpb25hbENoZWNrRmFpbGVkRXhjZXB0aW9uJykge1xyXG4gICAgICBjb25zb2xlLmxvZyhg4oS577iPIFVzdWFyaW8geWEgZXhpc3RlOiAke3VzZXJJZH1gKTtcclxuICAgICAgcmV0dXJuIG51bGw7IC8vIFVzdWFyaW8geWEgZXhpc3RlXHJcbiAgICB9XHJcbiAgICB0aHJvdyBlcnJvcjtcclxuICB9XHJcbn07Il19