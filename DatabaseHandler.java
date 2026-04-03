import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;


public class DatabaseHandler {
    String url = "jdbc:sqlite:fitness.db";

    void createTables() {
        try (Connection conn = DriverManager.getConnection(url)){
            Statement stmt = conn.createStatement();
            stmt.execute("CREATE TABLE IF NOT EXISTS workouts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)");
            stmt.execute("CREATE TABLE IF NOT EXISTS exercies (id INTEGER PRIMARY KEY AUTOINCREMENT, workout_id INTEGER NOT NULL, name TEXT NOT NULL, FOREIGN KEY (workout_id) REFERENCES workouts(id))");
            stmt.execute("CREATE TABLE IF NOT EXISTS exercie_sets (id INTEGER PRIMARY KEY AUTOINCREMENT, exercise_id INTEGER NOT NULL, weight REAL NOT NULL, reps INTEGER NOT NULL, FOREIGN KEY (exercise_id) REFERENCES exercises(id))");
        } catch (SQLException e) {
            System.out.println("Database error: " + e.getMessage());
        }
    }

    int saveWorkout(String name) {
        String sql = "INSERT INTO workouts (name) VALUES (?)";
            try (Connection conn = DriverManager.getConnection(url);
                PreparedStatement pstmt = conn.prepareStatement(sql)) {
                pstmt.setString(1, name);
                pstmt.executeUpdate();
                
                // Get the auto-generated id
                ResultSet keys = pstmt.getGeneratedKeys();
                if (keys.next()) {
                    return keys.getInt(1);
                }
            } catch (SQLException e) {
                System.out.println("Database error: " + e.getMessage());
            }
            return -1;
    }
}
