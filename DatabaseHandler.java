import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;


public class DatabaseHandler {
    String url = "jdbc:sqlite:fitness.db";

    void createTables() {
        try (Connection conn = DriverManager.getConnection(url)){
            Statement stmt = conn.createStatement();
            stmt.execute("CREATE TABLE IF NOT EXISTS workouts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)");
            stmt.execute("CREATE TABLE IF NOT EXISTS exercises (id INTEGER PRIMARY KEY AUTOINCREMENT, workout_id INTEGER NOT NULL, name TEXT NOT NULL, FOREIGN KEY (workout_id) REFERENCES workouts(id))");
            stmt.execute("CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, workout_id INTEGER NOT NULL, date TEXT NOT NULL, FOREIGN KEY (workout_id) REFERENCES workouts(id))");
            stmt.execute("CREATE TABLE IF NOT EXISTS exercise_sets (id INTEGER PRIMARY KEY AUTOINCREMENT, exercise_id INTEGER NOT NULL, weight REAL NOT NULL, reps INTEGER NOT NULL, session_id INTEGER NOT NULL, FOREIGN KEY (exercise_id) REFERENCES exercises(id), FOREIGN KEY (session_id) REFERENCES sessions(id))");
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

    int saveExercise(String name, int workoutId){
        String sql = "INSERT INTO exercises (name, workout_id) VALUES (?, ?)";
        try (Connection conn = DriverManager.getConnection(url);
            PreparedStatement pstmt = conn.prepareStatement(sql)) {
                pstmt.setString (1, name);
                pstmt.setInt(2, workoutId);
                pstmt.executeUpdate();
                
                ResultSet keys = pstmt.getGeneratedKeys();
                if (keys.next())
                    return keys.getInt(1);
                
        } catch (SQLException e) {
            System.out.println("Database error: " + e.getMessage());
        }
        return -1;
    }

    int saveSession(int workoutId, String date) {
        String sql = "INSERT INTO sessions (date, workout_id) VALUES (?, ?)";
        try (Connection conn = DriverManager.getConnection(url);
            PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString (1, date);
            pstmt.setInt(2, workoutId);
            pstmt.executeUpdate();
                        
            ResultSet keys = pstmt.getGeneratedKeys();
            if (keys.next())
                return keys.getInt(1);
                        
        } catch (SQLException e) {
            System.out.println("Database error: " + e.getMessage());
        }
        return -1;
    }

    int saveSet (double weight, int reps, int exerciseId, int sessonId){
        String sql = "INSERT INTO exercise_sets (weight, reps, exercise_id, session_id) VALUES (?, ?, ?, ?)";
        try (Connection conn = DriverManager.getConnection(url);
            PreparedStatement pstmt = conn.prepareStatement(sql)) {
                pstmt.setDouble (1, weight);
                pstmt.setInt(2, reps);
                pstmt.setInt(3, exerciseId);
                pstmt.setInt(4, sessonId);
                pstmt.executeUpdate();
                
                ResultSet keys = pstmt.getGeneratedKeys();
                if (keys.next())
                    return keys.getInt(1);
                
        } catch (SQLException e) {
            System.out.println("Database error: " + e.getMessage());
        }
        return -1;       
    }

    void deleteWorkout(int id) {
        String sqlSets = "DELETE FROM exercise_sets WHERE exercise_id IN (SELECT id FROM exercises WHERE workout_id = ?)";
        String sqlSessions = "DELETE FROM sessions WHERE workout_id = ?";
        String sqlExercises = "DELETE FROM exercises WHERE workout_id = ?";
        String sqlWorkout = "DELETE FROM workouts WHERE id = ?";
        try (Connection conn = DriverManager.getConnection(url)) {
            PreparedStatement pstmt1 = conn.prepareStatement(sqlSets);
            pstmt1.setInt(1, id);
            pstmt1.executeUpdate();

            PreparedStatement pstmt2 = conn.prepareStatement(sqlSessions);
            pstmt2.setInt(1, id);
            pstmt2.executeUpdate();

            PreparedStatement pstmt3 = conn.prepareStatement(sqlExercises);
            pstmt3.setInt(1, id);
            pstmt3.executeUpdate();

            PreparedStatement pstmt4 = conn.prepareStatement(sqlWorkout);
            pstmt4.setInt(1, id);
            pstmt4.executeUpdate();
        } catch (SQLException e) {
            System.out.println("Database error: " + e.getMessage());
        }
    }

    void deleteExercise(int id) {
        String sqlSets = "DELETE FROM exercise_sets WHERE exercise_id = ?";
        String sqlExercise = "DELETE FROM exercises WHERE id = ?";
        try (Connection conn = DriverManager.getConnection(url)) {
            PreparedStatement pstmt1 = conn.prepareStatement(sqlSets);
            pstmt1.setInt(1, id);
            pstmt1.executeUpdate();

            PreparedStatement pstmt2 = conn.prepareStatement(sqlExercise);
            pstmt2.setInt(1, id);
            pstmt2.executeUpdate();
        } catch (SQLException e) {
            System.out.println("Database error: " + e.getMessage());
        }
    }

    void deleteSet(int id) {
        String sql = "DELETE FROM exercise_sets WHERE id = ?";
        try (Connection conn = DriverManager.getConnection(url);
            PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setInt(1, id);
            pstmt.executeUpdate();
        } catch (SQLException e) {
            System.out.println("Database error: " + e.getMessage());
        }
    }

    ArrayList<ExerciseSet> loadLastestSet(int exerciseId, int workoutId) {
        ArrayList<ExerciseSet> sets = new ArrayList<>();
        String sqlSession = "SELECT id FROM sessions WHERE workout_id = ? ORDER BY date DESC LIMIT 1";
        String sqlSets = "SELECT * FROM exercise_sets WHERE exercise_id = ? AND session_id = ?";
        try (Connection conn = DriverManager.getConnection(url)) {
            PreparedStatement pstmt1 = conn.prepareStatement(sqlSession);
            pstmt1.setInt(1, workoutId);
            ResultSet rs = pstmt1.executeQuery();

            if (!rs.next())
                return sets; //No lastest session saved

            int sessionId = rs.getInt("id");

            // Get sets from that session
            PreparedStatement pstmt2 = conn.prepareStatement(sqlSets);
            pstmt2.setInt(1, exerciseId);
            pstmt2.setInt(2, sessionId);
            ResultSet rs2 = pstmt2.executeQuery();

            while (rs2.next()){
                int id = rs2.getInt("id");
                double weight = rs2.getDouble("weight");
                int reps = rs2.getInt("reps");
                ExerciseSet set = new ExerciseSet(weight, reps);
                set.id = id;
                sets.add(set);
            }

        } catch (SQLException e) {
            System.out.println("Database error: " + e.getMessage());
        }
        return sets;
    }

    ArrayList<Exercise> loadExercises(int workoutId) {
        ArrayList<Exercise> exercises = new ArrayList<>();
        String sql = "SELECT * FROM exercises WHERE workout_id = ?";
        try (Connection conn = DriverManager.getConnection(url);
            PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setInt(1, workoutId);
            ResultSet rs = pstmt.executeQuery();
            while (rs.next()) {
                int id = rs.getInt("id");
                String name = rs.getString("name");
                Exercise exercise =  new Exercise(name);
                exercise.id = id;
                exercise.sets = loadLastestSet(exercise.id, workoutId);
                exercises.add(exercise);
            }
        } catch (SQLException e){
            System.out.println("Database error: " + e.getMessage());
        }
        return exercises;
    }

    ArrayList<Workout> loadWorkout() {
        ArrayList<Workout> workouts = new ArrayList<>();
        String sql = "SELECT * FROM workouts";
        try (Connection conn = DriverManager.getConnection(url);
            Statement stmt = conn.createStatement()) {
            ResultSet rs = stmt.executeQuery(sql);
            while (rs.next()) {
                int id = rs.getInt("id");
                String name = rs.getString("name");
                Workout workout = new Workout(name);
                workout.id = id;
                workout.exercises = loadExercises(workout.id);
                workouts.add(workout);
            }
        } catch (SQLException e){
            System.out.println("Database error: " + e.getMessage());
        }
        return workouts;
    }
}
